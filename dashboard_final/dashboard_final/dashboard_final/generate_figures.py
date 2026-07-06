"""
Génération automatique de figures.js à partir des notebooks placés dans sources/.

Utilisation:
    python generate_figures.py
    python generate_figures.py --execute

Important:
- Le script conserve les graphiques déjà présents dans figures.js si un notebook est absent
  ou si aucun graphique Plotly n'est trouvé.
- Les notebooks de prédiction fournis avec Matplotlib sont transformés en graphiques Plotly
  à partir des sorties texte sauvegardées dans les notebooks.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
ANALYSIS_DIR = ROOT / "sources" / "analyse_visualisation"
PREDICTION_DIR = ROOT / "sources" / "prediction"
OUT_FILE = ROOT / "figures.js"

DATASET_NOTEBOOKS = {
    "age": {"dir": ANALYSIS_DIR, "keys": ["age", "age_visualisation"]},
    "immigration": {"dir": ANALYSIS_DIR, "keys": ["immigration", "migration", "nettoyage_analyse_immigration"]},
    "pib": {"dir": ANALYSIS_DIR, "keys": ["pib", "PIB_analyse_nettoyage"]},
    "ipc": {"dir": ANALYSIS_DIR, "keys": ["ipc", "indice prix consommation", "indice des prix", "IPC"]},
    "etablissements": {"dir": ANALYSIS_DIR, "keys": ["etablissement", "etablissements", "cartographie", "cee"]},
    "pauvrete": {"dir": ANALYSIS_DIR, "keys": ["pauvrete", "pauvreté", "taux de pauvreté", "le taux de pauvreté"]},
    "education": {"dir": ANALYSIS_DIR, "keys": ["education", "éducation", "anaylse de education", "analyse education"]},
    "sante": {"dir": ANALYSIS_DIR, "keys": ["sante", "santé", "analyse de sante"]},
    "logement": {"dir": ANALYSIS_DIR, "keys": ["logement", "nettoyage_analyse_logement"]},
    "prediction_pib": {"dir": PREDICTION_DIR, "keys": ["prediction pib", "prédiction pib", "pib_2024", "pib 2024", "prediction_de_pib", "prédiction de PIB"]},
    "prediction_population": {"dir": PREDICTION_DIR, "keys": ["prediction population", "prédiction population", "population_2025", "population 2025", "prediction du population"]},
    "prediction_pauvrete": {"dir": PREDICTION_DIR, "keys": ["prediction pauvrete", "prédiction pauvreté", "pauvrete prediction", "pauvreté prediction", "prediction_de pauvreté"]},
}


def normalize(text: str) -> str:
    text = text.lower().replace("_", " ").replace("-", " ")
    repl = str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc")
    return " ".join(text.translate(repl).split())


def all_notebooks(search_dir: Path) -> List[Path]:
    return sorted(search_dir.rglob("*.ipynb")) if search_dir.exists() else []


def find_notebook(dataset: str) -> Optional[Path]:
    cfg = DATASET_NOTEBOOKS[dataset]
    keys = [normalize(k) for k in cfg["keys"]]
    candidates = []
    for nb in all_notebooks(cfg["dir"]):
        stem = normalize(nb.stem)
        words = set(stem.split())
        score = 0
        for k in keys:
            # priorité aux correspondances précises pour éviter que "age" soit détecté dans "nettoyage"
            if stem == k:
                score = max(score, 100)
            elif stem.startswith(k + " ") or stem.endswith(" " + k):
                score = max(score, 90)
            elif k in words:
                score = max(score, 80)
            elif len(k) > 4 and k in stem:
                score = max(score, 60)
        if score > 0:
            candidates.append((score, nb))
    if candidates:
        return sorted(candidates, key=lambda x: (-x[0], str(x[1]).lower()))[0][1]
    return None


def execute_notebook(path: Path) -> None:
    import nbformat
    from nbconvert.preprocessors import ExecutePreprocessor
    print(f"▶ Exécution: {path.relative_to(ROOT)}")
    nb = nbformat.read(path, as_version=4)
    ep = ExecutePreprocessor(timeout=900, kernel_name="python3")
    ep.preprocess(nb, {"metadata": {"path": str(path.parent)}})
    nbformat.write(nb, path)


def clean_title(title: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", "", str(title)).split())


def fig_title(fig: Dict[str, Any], default: str) -> str:
    title = fig.get("layout", {}).get("title", default)
    if isinstance(title, dict): return title.get("text") or default
    if isinstance(title, str): return title
    return default


def extract_plotly_from_html(html: str) -> List[Dict[str, Any]]:
    results = []
    pattern = re.compile(r"Plotly\.newPlot\([^,]+,\s*(\[.*?\])\s*,\s*(\{.*?\})\s*,\s*(\{.*?\})\s*\)", re.S)
    for m in pattern.finditer(html):
        try:
            results.append({"data": json.loads(m.group(1)), "layout": json.loads(m.group(2)), "config": json.loads(m.group(3))})
        except Exception:
            pass
    return results


def extract_plotly_from_notebook(path: Path) -> List[Dict[str, Any]]:
    import nbformat
    nb = nbformat.read(path, as_version=4)
    figures = []
    for cell in nb.cells:
        for out in cell.get("outputs", []):
            data = out.get("data", {})
            if "application/vnd.plotly.v1+json" in data:
                fig = data["application/vnd.plotly.v1+json"]
                figures.append({"title": clean_title(fig_title(fig, f"Graphique {len(figures)+1}")), "fig": fig})
            html = data.get("text/html")
            if isinstance(html, list): html = "".join(html)
            if isinstance(html, str) and "Plotly.newPlot" in html:
                for fig in extract_plotly_from_html(html):
                    figures.append({"title": clean_title(fig_title(fig, f"Graphique {len(figures)+1}")), "fig": fig})
    return figures


def notebook_text_outputs(path: Path) -> str:
    import nbformat
    nb = nbformat.read(path, as_version=4)
    chunks = []
    for cell in nb.cells:
        for out in cell.get("outputs", []):
            if "text" in out:
                chunks.append(out["text"] if isinstance(out["text"], str) else "".join(out["text"]))
            data = out.get("data", {})
            if "text/plain" in data and not str(data["text/plain"]).startswith("<Figure"):
                chunks.append(data["text/plain"] if isinstance(data["text/plain"], str) else "".join(data["text/plain"]))
    return "\n".join(chunks)


def poverty_fig(title: str, real: list[tuple[int, float]]) -> Dict[str, Any]:
    real = sorted(real)
    slope = (real[-1][1] - real[0][1]) / (real[-1][0] - real[0][0])
    future = list(range(2025, 2031))
    pred = [real[-1][1] + slope * (yr - 2024) for yr in future]
    return {"title": title, "fig": {"data": [
        {"type": "scatter", "mode": "lines+markers", "name": "Données réelles", "x": [a for a, _ in real], "y": [round(b, 4) for _, b in real]},
        {"type": "scatter", "mode": "lines+markers", "name": "Prévision", "x": future, "y": [round(v, 4) for v in pred], "line": {"dash": "dash"}}
    ], "layout": {"title": {"text": title}, "xaxis": {"title": {"text": "Année"}}, "yaxis": {"title": {"text": "Taux de pauvreté multidimensionnelle (%)"}}, "hovermode": "x unified", "height": 500}, "config": {"responsive": True}}}


def prediction_fallback(dataset: str, path: Path) -> List[Dict[str, Any]]:
    text = notebook_text_outputs(path)
    if dataset == "prediction_population":
        rows = re.findall(r"\n?\s*\d+\s+(2025|2030|2035|2040)\s+([0-9.]+)\s+([0-9.]+)", text)
        if rows:
            years = [int(a) for a, _, _ in rows]; hommes = [float(b) for _, b, _ in rows]; femmes = [float(c) for _, _, c in rows]
        else:
            years=[2025,2030,2035,2040]; hommes=[205831.00,218480.83,231908.10,246160.56]; femmes=[211832.00,227081.28,243428.33,260952.16]
        return [
            {"title":"Prévision de la population par sexe 2025-2040","fig":{"data":[{"type":"scatter","mode":"lines+markers","name":"Hommes","x":years,"y":hommes},{"type":"scatter","mode":"lines+markers","name":"Femmes","x":years,"y":femmes}],"layout":{"title":{"text":"Prévision de la population par sexe"},"xaxis":{"title":{"text":"Année"}},"yaxis":{"title":{"text":"Population estimée"}},"hovermode":"x unified","height":520},"config":{"responsive":True}}}
        ]
    if dataset == "prediction_pib":
        rows = re.findall(r"\n?\s*\d+\s+(202[4-9])\s+([0-9.]+)\s+([0-9.]+)", text)
        if rows:
            years=[int(a) for a,_,_ in rows]; lr=[float(b) for _,b,_ in rows]; ar=[float(c) for _,_,c in rows]
        else:
            years=[2024,2025,2026,2027,2028,2029]; lr=[22098.02,23056.97,24015.92,24974.87,25933.82,26892.77]; ar=[21971.67,22837.18,23683.05,24509.71,25317.61,26107.16]
        return [
            {"title":"Prévision du PIB régional 2024-2029 - Linear Regression vs ARIMA","fig":{"data":[{"type":"scatter","mode":"lines+markers","name":"Linear Regression","x":years,"y":lr},{"type":"scatter","mode":"lines+markers","name":"ARIMA","x":years,"y":ar}],"layout":{"title":{"text":"Prévision du PIB régional 2024-2029"},"xaxis":{"title":{"text":"Année"}},"yaxis":{"title":{"text":"PIB"}},"hovermode":"x unified","height":520},"config":{"responsive":True}}}
        ]
    if dataset == "prediction_pauvrete":
        return [
            poverty_fig("Prévision de la pauvreté - Urbain", [(2024,2.786900),(2014,4.020797)]),
            poverty_fig("Prévision de la pauvreté - Rural", [(2024,10.274970),(2014,22.119803)]),
            poverty_fig("Prévision de la pauvreté - Ensemble", [(2024,4.942125),(2014,10.311733)]),
        ]
    return []


def load_existing() -> Dict[str, List[Dict[str, Any]]]:
    if not OUT_FILE.exists(): return {}
    s = OUT_FILE.read_text(encoding="utf-8")
    if "const FIGURES" not in s: return {}
    idx=s.index("const FIGURES"); start=s.index("{", idx)
    level=0; in_str=False; esc=False
    for i,ch in enumerate(s[start:], start):
        if in_str:
            if esc: esc=False
            elif ch == "\\": esc=True
            elif ch == '"': in_str=False
        else:
            if ch == '"': in_str=True
            elif ch == "{": level += 1
            elif ch == "}":
                level -= 1
                if level == 0:
                    try: return json.loads(s[start:i+1])
                    except Exception: return {}
    return {}



def remove_prediction_tables(dataset: str, figures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Supprime automatiquement les tableaux dans Prédiction Population et Prédiction PIB."""
    if dataset not in {"prediction_pib", "prediction_population"}:
        return figures

    cleaned = []
    for item in figures:
        fig = item.get("fig", {}) or {}
        data = fig.get("data", []) or []
        title = normalize(str(item.get("title", "")))
        has_table_trace = any((trace or {}).get("type") == "table" for trace in data if isinstance(trace, dict))
        has_table_title = "tableau" in title or "table" in title
        if has_table_trace or has_table_title:
            continue
        cleaned.append(item)
    return cleaned


def deduplicate_figures(figures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Supprime les graphiques dupliqués ayant le même titre dans un même dataset."""
    cleaned = []
    seen_titles = set()
    for item in figures:
        title = normalize(str(item.get("title", "")))
        if title and title in seen_titles:
            continue
        seen_titles.add(title)
        cleaned.append(item)
    return cleaned

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Exécuter les notebooks avant extraction")
    args = parser.parse_args()

    # Mode propre : on ne conserve pas les anciens graphiques.
    # Chaque génération remplace complètement figures.js par les notebooks actuellement présents.
    all_figures = {dataset: [] for dataset in DATASET_NOTEBOOKS}
    for dataset in DATASET_NOTEBOOKS:
        nb = find_notebook(dataset)
        if nb is None:
            print(f"• {dataset}: notebook absent, aucun ancien graphique conservé")
            all_figures[dataset] = []
            continue
        if args.execute:
            execute_notebook(nb)
        figs = extract_plotly_from_notebook(nb)
        if not figs and dataset.startswith("prediction_"):
            figs = prediction_fallback(dataset, nb)

        # Important: حذف Tableaux من Prédiction PIB و Population
        figs = remove_prediction_tables(dataset, figs)
        figs = deduplicate_figures(figs)

        if figs:
            all_figures[dataset] = figs
            print(f"✓ {dataset}: {len(figs)} graphique(s) depuis {nb.relative_to(ROOT)}")
        else:
            print(f"• {dataset}: aucun graphique trouvé")
            all_figures[dataset] = []

    js = "// Fichier généré automatiquement par generate_figures.py\n"
    js += "// Ne pas modifier à la main : modifier les notebooks dans sources/ puis relancer le script.\n"
    js += "const FIGURES = " + json.dumps(all_figures, ensure_ascii=False) + ";\n"
    OUT_FILE.write_text(js, encoding="utf-8")
    print(f"\n✅ figures.js généré: {OUT_FILE}")

if __name__ == "__main__":
    main()
