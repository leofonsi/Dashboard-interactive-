/* =====================================================
   DASHBOARD TERRITORIAL — GUELMIM OUED-NOUN
   Fichier : script.js
   Rôle :
   1) Navigation entre Accueil / Dashboard / Prédiction / Métadonnées
   2) Création automatique des cards à partir de la structure JS
   3) Création automatique des sections, onglets et graphiques
   4) Affichage Plotly depuis figures.js
   5) Suppression automatique des tableaux dans Prédiction PIB et Population
===================================================== */

'use strict';

/* =====================================================
   1. STRUCTURE DU DASHBOARD
===================================================== */

const DASHBOARD_STRUCTURE = {
  analysis: {
    page: 'dashboard',
    homeId: 'dashboard-home',
    cardsId: 'analysis-domain-cards',
    containerId: 'analysis-domain-container',
    backFunction: 'showDashboardHome()',
    domains: {
      demographie: {
        icon: '',
        title: 'Démographie',
        subtitle: 'Âge · Immigration',
        desc: 'Analyse de la structure par âge, de la répartition par sexe et des dynamiques migratoires.',
        grad: 'linear-gradient(135deg,#f59e0b,#ef4444)',
        datasets: ['age', 'immigration']
      },
      economie: {
        icon: '',
        title: 'Économie',
        subtitle: 'PIB · IPC · Établissements économiques',
        desc: 'Analyse du PIB régional, de l’IPC, des établissements économiques et de l’emploi.',
        grad: 'linear-gradient(135deg,#8b5cf6,#2563eb)',
        datasets: ['pib', 'ipc', 'etablissements']
      },
      social: {
        icon: '',
        title: 'Social',
        subtitle: 'Pauvreté · Éducation · Santé',
        desc: 'Lecture des indicateurs sociaux liés à la pauvreté, à la scolarisation et à l’offre sanitaire.',
        grad: 'linear-gradient(135deg,#fb7185,#f97316)',
        datasets: ['pauvrete', 'education', 'sante']
      },
      logement: {
        icon: '',
        title: 'Logement',
        subtitle: 'Parc de logements',
        desc: 'Analyse du parc de logements, des types d’habitat, de l’occupation et des services de base.',
        grad: 'linear-gradient(135deg,#22c55e,#14b8a6)',
        datasets: ['logement']
      }
    }
  },

  prediction: {
    page: 'prediction',
    homeId: 'prediction-home',
    cardsId: 'prediction-domain-cards',
    containerId: 'prediction-domain-container',
    backFunction: 'showPredictionHome()',
    domains: {
    
      pred_pib: {
        icon: '',
        title: 'Prédiction PIB',
        subtitle: 'PIB 2024–2029',
        desc: 'Prévision du PIB régional.',
        grad: 'linear-gradient(135deg,#2563eb,#06b6d4)',
        datasets: ['prediction_pib']
      }
    }
  }
};

/* =====================================================
   2. LIBELLÉS DES DATASETS
===================================================== */

const LABELS = {
  age: 'Âge',
  immigration: 'Immigration',
  pib: 'PIB',
  ipc: 'IPC',
  etablissements: 'Établissements économiques',
  pauvrete: 'Pauvreté',
  education: 'Éducation',
  sante: 'Santé',
  logement: 'Logement',
  prediction_population: 'Prévision Population',
  prediction_pib: 'Prévision PIB',
  prediction_pauvrete: 'Prévision Pauvreté'
};

const DESCRIPTIONS = {
  age: 'Population par âge, sexe et indicateurs démographiques.',
  immigration: 'Mouvements migratoires internes et internationaux.',
  pib: 'Analyse du produit intérieur brut régional et de son évolution.',
  ipc: 'Indice des prix à la consommation : évolution mensuelle, secteurs alimentaire et non alimentaire.',
  etablissements: 'Structure des établissements économiques et de l’emploi.',
  pauvrete: 'Indicateurs de pauvreté multidimensionnelle.',
  education: 'Indicateurs scolaires, scolarisation et encadrement.',
  sante: 'Offre sanitaire, infrastructures et ressources médicales.',
  logement: 'Parc logement, types d’habitat et accès aux services.',
  prediction_population: 'Projection de la population future de la région.',
  prediction_pib: 'Prévision du PIB régional pour la période 2024-2029.',
  prediction_pauvrete: 'Prévision de la pauvreté multidimensionnelle.'
};

/* Les tableaux à supprimer uniquement dans ces datasets */
const DATASETS_WITHOUT_TABLES = new Set([
  'prediction_population',
  'prediction_pib'
]);

/* Pour éviter de reconstruire plusieurs fois le même bloc */
const renderedDatasets = new Set();

/* =====================================================
   3. OUTILS GÉNÉRAUX
===================================================== */

function $(selector, parent = document) {
  return parent.querySelector(selector);
}

function $all(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

function safeText(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function normalizeText(value) {
  return safeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isTableFigure(item) {
  const fig = item?.fig || {};
  const data = Array.isArray(fig.data) ? fig.data : [];
  const title = normalizeText(item?.title || fig?.layout?.title?.text || fig?.layout?.title || '');

  const hasTableTrace = data.some(trace => trace && trace.type === 'table');
  const hasTableTitle = title.includes('tableau') || title.includes('table');

  return hasTableTrace || hasTableTitle;
}

function getFigures(dataset) {
  const rawFigures = (typeof FIGURES !== 'undefined' && FIGURES[dataset]) ? FIGURES[dataset] : [];

  if (!Array.isArray(rawFigures)) return [];

  if (DATASETS_WITHOUT_TABLES.has(dataset)) {
    return rawFigures.filter(item => !isTableFigure(item));
  }

  return rawFigures;
}

function getPlotLayout(fig, dataset = '', index = 0) {
  const originalLayout = (fig && fig.layout) ? fig.layout : {};
  const data = Array.isArray(fig?.data) ? fig.data : [];

  const isAgePyramid = dataset === 'age' && index === 0;
  const hasHorizontalBars = data.some(trace => trace && trace.type === 'bar' && trace.orientation === 'h');
  const hasLegend = data.length > 1 || data.some(trace => trace && trace.showlegend === true);

  /* Hauteur suffisante pour garder les graphiques lisibles sans casser les cartes. */
  const chartHeight = isAgePyramid ? 780 : (hasHorizontalBars ? 720 : 620);

  /* Les graphiques horizontaux ont des libellés longs à gauche : on leur donne
     une marge spécifique pour éviter que l'axe Y et la légende entrent dans le dessin. */
  const marginLeft = isAgePyramid ? 135 : (hasHorizontalBars ? 430 : 90);
  const marginTop = hasLegend ? 105 : 55;
  const marginBottom = hasHorizontalBars ? 95 : 85;

  const cleanAxis = (axis = {}) => {
    const a = { ...axis };
    if (!isAgePyramid) {
      delete a.range;
      delete a.tickvals;
      delete a.ticktext;
      delete a.zeroline;
      delete a.zerolinewidth;
      delete a.zerolinecolor;
    }
    a.automargin = true;
    if (hasHorizontalBars) {
      a.tickfont = { ...(a.tickfont || {}), size: 13 };
    }
    return a;
  };

  return {
    ...originalLayout,
    height: chartHeight,
    autosize: true,
    title: { text: '' },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: {
      family: 'Inter, Segoe UI, Arial, sans-serif',
      size: hasHorizontalBars ? 14 : 15,
      color: '#0f172a',
      ...(originalLayout.font || {})
    },
    margin: {
      ...(originalLayout.margin || {}),
      l: marginLeft,
      r: 45,
      t: marginTop,
      b: marginBottom
    },
    legend: {
      ...(originalLayout.legend || {}),
      orientation: 'h',
      x: 0,
      xanchor: 'left',
      y: 1.18,
      yanchor: 'bottom',
      bgcolor: 'rgba(255,255,255,0.92)',
      font: { size: 13 }
    },
    xaxis: cleanAxis(originalLayout.xaxis || {}),
    yaxis: cleanAxis(originalLayout.yaxis || {})
  };
}

function getPlotConfig(fig) {
  return {
    responsive: true,
    displayModeBar: false,
    scrollZoom: false,
    ...((fig && fig.config) || {})
  };
}

/* =====================================================
   4. NAVIGATION PRINCIPALE
===================================================== */

function showPage(pageId) {
  $all('.page').forEach(page => page.classList.remove('active'));

  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  $all('.nav').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initNavigation() {
  $all('.nav').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
}

/* =====================================================
   5. CONSTRUCTION AUTOMATIQUE DES CARDS
===================================================== */

function buildHomeCards(type) {
  const cfg = DASHBOARD_STRUCTURE[type];
  if (!cfg) return;

  const target = document.getElementById(cfg.cardsId);
  if (!target) return;

  target.innerHTML = '';

  Object.entries(cfg.domains).forEach(([domainKey, domain]) => {
    const card = document.createElement('article');
    card.className = 'domain-card';
    card.style.setProperty('--grad', domain.grad);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    card.innerHTML = `
      <div class="domain-icon">${domain.icon}</div>
      <h3>${domain.title}</h3>
      <p><b>${domain.subtitle}</b><br>${domain.desc}</p>
      <span class="go">Ouvrir le dossier →</span>
    `;

    card.addEventListener('click', () => showDomain(type, domainKey));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') showDomain(type, domainKey);
    });

    target.appendChild(card);
  });
}

/* =====================================================
   6. CONSTRUCTION AUTOMATIQUE DES SECTIONS
===================================================== */

function buildDomainSections(type) {
  const cfg = DASHBOARD_STRUCTURE[type];
  if (!cfg) return;

  const target = document.getElementById(cfg.containerId);
  if (!target) return;

  target.innerHTML = '';

  Object.entries(cfg.domains).forEach(([domainKey, domain]) => {
    const section = document.createElement('section');
    section.className = 'domain-section';
    section.id = `${type}-domain-${domainKey}`;

    const tabsHtml = domain.datasets.map(dataset => `
      <button class="pill-btn" data-dataset="${dataset}" onclick="showDataset('${type}','${domainKey}','${dataset}')">
        ${LABELS[dataset] || dataset}
      </button>
    `).join('');

    const panelsHtml = domain.datasets.map(dataset => `
      <div class="dataset-panel" id="panel-${dataset}">
        <div class="intro-card dataset-intro">
          <h2>${LABELS[dataset] || dataset}</h2>
          <p>${DESCRIPTIONS[dataset] || 'Graphiques générés automatiquement depuis le notebook source.'}</p>

        </div>
        <div class="charts-grid"></div>
      </div>
    `).join('');

    section.innerHTML = `
      <div class="domain-header">
        <div>
          <h2>${domain.title}</h2>
          <p>${domain.desc}</p>
        </div>
        <button class="back-btn" onclick="${cfg.backFunction}">← Retour aux cards</button>
      </div>
      <div class="tabs">${tabsHtml}</div>
      ${panelsHtml}
    `;

    target.appendChild(section);
  });
}

/* =====================================================
   7. AFFICHAGE DES DOMAINES
===================================================== */

function showDashboardHome() {
  const home = document.getElementById('dashboard-home');
  if (home) home.classList.remove('hidden');
  $all('#analysis-domain-container .domain-section').forEach(section => section.classList.remove('active'));
}

function showPredictionHome() {
  const home = document.getElementById('prediction-home');
  if (home) home.classList.remove('hidden');
  $all('#prediction-domain-container .domain-section').forEach(section => section.classList.remove('active'));
}

function showDomain(type, domainKey) {
  const cfg = DASHBOARD_STRUCTURE[type];
  if (!cfg || !cfg.domains[domainKey]) return;

  showPage(cfg.page);

  const home = document.getElementById(cfg.homeId);
  if (home) home.classList.add('hidden');

  $all(`#${cfg.containerId} .domain-section`).forEach(section => {
    section.classList.remove('active');
  });

  const section = document.getElementById(`${type}-domain-${domainKey}`);
  if (!section) return;

  section.classList.add('active');

  const firstDataset = cfg.domains[domainKey].datasets[0];
  showDataset(type, domainKey, firstDataset);

  setTimeout(() => {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 70);
}

function showDataset(type, domainKey, dataset) {
  const section = document.getElementById(`${type}-domain-${domainKey}`);
  if (!section) return;

  $all('.pill-btn', section).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dataset === dataset);
  });

  $all('.dataset-panel', section).forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${dataset}`);
  });

  renderDataset(dataset);
}

/* =====================================================
   8. CRÉATION ET AFFICHAGE DES GRAPHIQUES
===================================================== */

function renderDataset(dataset) {
  const panel = document.getElementById(`panel-${dataset}`);
  if (!panel) return;

  const grid = $('.charts-grid', panel);
  if (!grid) return;

  const figures = getFigures(dataset);

  if (!renderedDatasets.has(dataset)) {
    grid.innerHTML = '';

    if (!figures.length) {
      grid.innerHTML = `
        <article class="chart-card empty-card">
          <h3>Aucun graphique trouvé</h3>
          <p>
            Vérifiez le notebook dans le dossier <b>sources</b>, puis lancez :
            <br><code>python generate_figures.py --execute</code>
          </p>
        </article>
      `;
      renderedDatasets.add(dataset);
      return;
    }

    figures.forEach((item, index) => {
      const title = safeText(item.title, `Graphique ${index + 1}`);
      const card = document.createElement('article');
      card.className = 'chart-card';

      card.innerHTML = `
        <div class="chart-top">
          <div>
            <span class="chart-index">Graphique ${String(index + 1).padStart(2, '0')}</span>
            <h3>${title}</h3>
          </div>
          
        </div>

        <div class="plot" id="plot-${dataset}-${index}"></div>

        ${dataset.startsWith('prediction_') ? `
          <div class="interpretation">
            <b>Interprétation :</b>
            <p>${getInterpretation(dataset)}</p>
          </div>
        ` : ''}
      `;

      grid.appendChild(card);
    });

    renderedDatasets.add(dataset);
  }

  figures.forEach((item, index) => {
    const target = document.getElementById(`plot-${dataset}-${index}`);
    if (!target || target.dataset.drawn === '1') return;

    const fig = item.fig || {};

    try {
      Plotly.newPlot(
        target,
        fig.data || [],
        getPlotLayout(fig, dataset, index),
        getPlotConfig(fig)
      );
      target.dataset.drawn = '1';
    } catch (error) {
      target.innerHTML = `<p class="plot-error">Erreur d’affichage du graphique.</p>`;
      console.error('Plotly error:', dataset, index, error);
    }
  });
}

/* =====================================================
   9. INTERPRÉTATIONS POUR LA PAGE PRÉDICTION
===================================================== */

function getInterpretation(dataset) {
  if (dataset === 'prediction_population') {
    return 'Ce graphique présente l’évolution prévisionnelle de la population régionale. Il aide à anticiper les besoins futurs en logement, santé, éducation et services publics.';
  }

  if (dataset === 'prediction_pib') {
    return 'Ce graphique montre la tendance prévisionnelle du PIB régional. Il permet d’évaluer la dynamique économique attendue et l’évolution de la création de richesse.';
  }

  if (dataset === 'prediction_pauvrete') {
    return 'Ce graphique illustre l’évolution prévue de la pauvreté multidimensionnelle et permet d’analyser les tendances sociales futures au niveau territorial.';
  }

  return 'Cette visualisation présente les résultats issus du modèle de prédiction.';
}

/* =====================================================
   10. REDIMENSIONNEMENT RESPONSIVE
===================================================== */

function resizePlots() {
  $all('.plot').forEach(plot => {
    try {
      Plotly.Plots.resize(plot);
    } catch (error) {
      console.warn('Resize Plotly error:', error);
    }
  });
}

window.addEventListener('resize', resizePlots);

/* =====================================================
   11. INITIALISATION
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  buildHomeCards('analysis');
  buildHomeCards('prediction');
  buildDomainSections('analysis');
  buildDomainSections('prediction');
  showPage('accueil');
});
