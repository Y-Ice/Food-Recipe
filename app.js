

'use strict';

// ── CONSTANTS ──────────────────────────────────────────────
const API = 'https://www.themealdb.com/api/json/v1/1';
const PAGE_SIZE = 12;

// ── STATE ──────────────────────────────────────────────────
let allMeals = [];    // current full result set
let displayedCount = 0;     // how many cards shown
let currentCategory = 'all';
let searchQuery = '';
let favorites = JSON.parse(localStorage.getItem('saveur_favs') || '{}');

// ── DOM REFS ───────────────────────────────────────────────
const homeView = document.getElementById('home-view');
const detailView = document.getElementById('detail-view');
const favView = document.getElementById('favorites-view');
const recipeGrid = document.getElementById('recipeGrid');
const favGrid = document.getElementById('favGrid');
const noResults = document.getElementById('noResults');
const noFavs = document.getElementById('noFavs');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const gridTitle = document.getElementById('gridTitle');
const searchInput = document.getElementById('searchInput');
const categoryPills = document.getElementById('categoryPills');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');
const favBadge = document.getElementById('fav-count-badge');

// ── INIT ───────────────────────────────────────────────────
(async function init() {
    restoreTheme();
    updateFavBadge();
    await loadCategories();
    await loadFeaturedMeals();

    // Live search on Enter or after 500ms pause
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleSearch, 500);
    });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(debounceTimer); handleSearch(); }
    });
})();

// ── THEME ──────────────────────────────────────────────────
function restoreTheme() {
    const saved = localStorage.getItem('saveur_theme') || 'light';
    document.body.setAttribute('data-theme', saved);
    document.getElementById('theme-icon').textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('saveur_theme', next);
    document.getElementById('theme-icon').textContent = next === 'dark' ? '☀️' : '🌙';
}

// ── LOADER ─────────────────────────────────────────────────
function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

// ── TOAST ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, 2600);
}

// ── API HELPERS ────────────────────────────────────────────
async function apiGet(path) {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error('API error ' + res.status);
    return res.json();
}

// ── LOAD CATEGORIES ────────────────────────────────────────
async function loadCategories() {
    try {
        const data = await apiGet('/categories.php');
        const cats = data.categories || [];
        cats.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'pill';
            btn.textContent = cat.strCategory;
            btn.onclick = () => filterByCategory(cat.strCategory);
            categoryPills.appendChild(btn);
        });
    } catch (e) {
        console.warn('Could not load categories', e);
    }
}

// ── LOAD FEATURED MEALS ─────────────────────────────────────
async function loadFeaturedMeals() {
    showLoader();
    showSkeletons();
    try {
        // Fetch a variety: search popular letters to get diverse results
        const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const picks = ['a', 'c', 's', 'b']; // balanced fetch
        const results = await Promise.all(picks.map(l => apiGet(`/search.php?f=${l}`)));
        allMeals = results.flatMap(r => r.meals || []);
        allMeals = shuffleArray(allMeals);
        displayedCount = 0;
        renderGrid();
    } catch (e) {
        console.error(e);
        showToast('⚠️ Could not load recipes. Check your connection.');
    } finally {
        hideLoader();
    }
}

// ── FILTER BY CATEGORY ─────────────────────────────────────
async function filterByCategory(cat) {
    currentCategory = cat;
    searchQuery = '';
    searchInput.value = '';

    // Update pill styles
    document.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.textContent === (cat === 'all' ? 'All' : cat));
    });

    showLoader();
    showSkeletons();
    try {
        if (cat === 'all') {
            await loadFeaturedMeals();
            return;
        }
        const data = await apiGet(`/filter.php?c=${encodeURIComponent(cat)}`);
        allMeals = data.meals || [];
        displayedCount = 0;
        gridTitle.textContent = cat + ' Recipes';
        renderGrid();
    } catch (e) {
        console.error(e);
        showToast('Could not load category.');
    } finally {
        hideLoader();
    }
}

// ── SEARCH ─────────────────────────────────────────────────
async function handleSearch() {
    const q = searchInput.value.trim();
    if (!q) { resetSearch(); return; }
    searchQuery = q;

    showLoader();
    showSkeletons();
    try {
        const data = await apiGet(`/search.php?s=${encodeURIComponent(q)}`);
        allMeals = data.meals || [];
        displayedCount = 0;
        gridTitle.textContent = allMeals.length
            ? `Results for "${q}"`
            : `No results for "${q}"`;
        renderGrid();
    } catch (e) {
        console.error(e);
        showToast('Search failed. Try again.');
    } finally {
        hideLoader();
    }
}

function resetSearch() {
    searchInput.value = '';
    searchQuery = '';
    currentCategory = 'all';
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    document.querySelector('.pill').classList.add('active');
    gridTitle.textContent = 'Featured Recipes';
    loadFeaturedMeals();
}

// ── RENDER GRID ────────────────────────────────────────────
function renderGrid(append = false) {
    if (!append) {
        recipeGrid.innerHTML = '';
        displayedCount = 0;
    }

    if (allMeals.length === 0) {
        noResults.classList.remove('hidden');
        loadMoreWrap.classList.add('hidden');
        return;
    }

    noResults.classList.add('hidden');

    const slice = allMeals.slice(displayedCount, displayedCount + PAGE_SIZE);
    displayedCount += slice.length;

    slice.forEach((meal, i) => {
        const card = createCard(meal, i);
        recipeGrid.appendChild(card);
    });

    // Show/hide load more
    if (displayedCount < allMeals.length) {
        loadMoreWrap.classList.remove('hidden');
    } else {
        loadMoreWrap.classList.add('hidden');
    }
}

function loadMore() {
    renderGrid(true);
}

// ── CREATE CARD ────────────────────────────────────────────
function createCard(meal, animIndex = 0) {
    const isFav = !!favorites[meal.idMeal];
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.style.animationDelay = (animIndex * 0.06) + 's';

    const imgSrc = meal.strMealThumb || 'https://via.placeholder.com/400x300?text=No+Image';
    const cat = meal.strCategory || '';
    const area = meal.strArea || '';

    card.innerHTML = `
    <div class="card-img-wrap">
      <img src="${imgSrc}/preview" alt="${escapeHtml(meal.strMeal)}" loading="lazy"
           onerror="this.src='https://via.placeholder.com/400x300?text=🍽️'" />
      ${cat ? `<span class="card-category-badge">${escapeHtml(cat)}</span>` : ''}
      <button class="card-fav-btn ${isFav ? 'active' : ''}"
              onclick="toggleFav(event, '${meal.idMeal}')"
              title="${isFav ? 'Remove from saved' : 'Save recipe'}"
              data-id="${meal.idMeal}">
        ${isFav ? '♥' : '♡'}
      </button>
    </div>
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(meal.strMeal)}</h3>
      <p class="card-desc">${escapeHtml(meal.strInstructions ? meal.strInstructions.slice(0, 100) + '…' : 'Tap to see the full recipe, ingredients and step-by-step instructions.')}</p>
      <div class="card-meta">
        ${area ? `<span class="card-meta-item">🌍 ${escapeHtml(area)}</span>` : ''}
        <span class="card-meta-item">📖 Recipe</span>
        <span class="card-arrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </span>
      </div>
    </div>
  `;

    // Click on card (not on fav btn) → open detail
    card.addEventListener('click', e => {
        if (e.target.closest('.card-fav-btn')) return;
        openDetail(meal.idMeal);
    });

    return card;
}

// ── DETAIL PAGE ────────────────────────────────────────────
async function openDetail(mealId) {
    showLoader();
    try {
        const data = await apiGet(`/lookup.php?i=${mealId}`);
        const meal = data.meals && data.meals[0];
        if (!meal) throw new Error('Not found');
        renderDetail(meal);
        showView('detail');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        console.error(e);
        showToast('Could not load recipe. Try again.');
    } finally {
        hideLoader();
    }
}

function renderDetail(meal) {
    const isFav = !!favorites[meal.idMeal];

    // Build ingredients list
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
        const ing = meal[`strIngredient${i}`];
        const msr = meal[`strMeasure${i}`];
        if (ing && ing.trim()) ingredients.push({ ing: ing.trim(), msr: (msr || '').trim() });
    }

    // Parse instructions into steps
    const rawInst = meal.strInstructions || '';
    const steps = parseSteps(rawInst);

    document.getElementById('detailContent').innerHTML = `
    <div class="detail-hero">
      <div class="detail-img-wrap">
        <img src="${meal.strMealThumb}" alt="${escapeHtml(meal.strMeal)}"
             onerror="this.src='https://via.placeholder.com/600x600?text=🍽️'" />
      </div>
      <div class="detail-info">
        <div class="detail-eyebrow">
          ${meal.strCategory ? `<span class="detail-cat-badge">${escapeHtml(meal.strCategory)}</span>` : ''}
          ${meal.strArea ? `<span class="detail-area-badge">🌍 ${escapeHtml(meal.strArea)}</span>` : ''}
        </div>
        <h1 class="detail-title">${escapeHtml(meal.strMeal)}</h1>

        <div class="detail-actions">
          <button class="detail-fav-btn ${isFav ? 'active' : ''}"
                  id="detailFavBtn"
                  onclick="toggleFav(event, '${meal.idMeal}', true)">
            ${isFav ? '♥ Saved' : '♡ Save Recipe'}
          </button>
          ${meal.strYoutube ? `<a href="${meal.strYoutube}" target="_blank" class="yt-link">▶ Watch Video</a>` : ''}
        </div>

        <div class="detail-meta-strip">
          <div class="detail-meta-item">🍽️ <strong>${escapeHtml(meal.strCategory || 'Dish')}</strong></div>
          <div class="detail-meta-item">🌍 <strong>${escapeHtml(meal.strArea || 'World')}</strong></div>
          <div class="detail-meta-item">📋 <strong>${ingredients.length} ingredients</strong></div>
          <div class="detail-meta-item">📖 <strong>${steps.length} steps</strong></div>
        </div>

        <div class="ingredients-block">
          <h3 class="block-title">Ingredients</h3>
          <ul class="ingredients-list">
            ${ingredients.map(({ ing, msr }) => `
              <li class="ingredient-item">
                <span class="ingredient-dot"></span>
                ${msr ? `<span class="ingredient-measure">${escapeHtml(msr)}</span>` : ''}
                <span>${escapeHtml(ing)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    </div>

    <div class="instructions-block">
      <h3 class="block-title">Instructions</h3>
      <ol class="instruction-steps">
        ${steps.map((s, i) => `
          <li class="instruction-step">
            <div class="step-number">${i + 1}</div>
            <p class="step-text">${escapeHtml(s)}</p>
          </li>
        `).join('')}
      </ol>
    </div>
  `;

    // Store current meal on the fav button for toggling
    document.getElementById('detailFavBtn').dataset.meal = JSON.stringify({
        idMeal: meal.idMeal,
        strMeal: meal.strMeal,
        strMealThumb: meal.strMealThumb,
        strCategory: meal.strCategory,
        strArea: meal.strArea
    });
}

function parseSteps(raw) {
    // Split on numbered steps like "1." or "\n\n"
    let steps = raw.split(/\r\n|\r|\n/)
        .map(s => s.trim())
        .filter(s => s.length > 10);

    // If very few lines, treat whole thing as paragraphs
    if (steps.length <= 2) {
        steps = raw.split(/\.\s+/).filter(s => s.trim().length > 10).map(s => s.trim() + '.');
    }
    return steps.slice(0, 30); // cap at 30
}

// ── FAVOURITES ─────────────────────────────────────────────
function toggleFav(e, mealId, fromDetail = false) {
    e.stopPropagation();

    let meal;
    if (fromDetail) {
        meal = JSON.parse(e.currentTarget.dataset.meal || '{}');
    } else {
        // Build a minimal meal obj from card data
        const card = e.currentTarget.closest('.recipe-card');
        meal = {
            idMeal: mealId,
            strMeal: card.querySelector('.card-title').textContent,
            strMealThumb: card.querySelector('img').src.replace('/preview', ''),
            strCategory: card.querySelector('.card-category-badge')?.textContent || '',
            strArea: ''
        };
    }

    const isFav = !!favorites[mealId];

    if (isFav) {
        delete favorites[mealId];
        showToast('Removed from saved recipes');
    } else {
        favorites[mealId] = meal;
        showToast('♥ Saved to your recipes!');
    }

    localStorage.setItem('saveur_favs', JSON.stringify(favorites));
    updateFavBadge();
    updateFavButtons(mealId, !isFav);
}

function updateFavButtons(mealId, isNowFav) {
    // Update all card fav buttons
    document.querySelectorAll(`[data-id="${mealId}"].card-fav-btn`).forEach(btn => {
        btn.textContent = isNowFav ? '♥' : '♡';
        btn.classList.toggle('active', isNowFav);
        btn.title = isNowFav ? 'Remove from saved' : 'Save recipe';
    });
    // Update detail fav button
    const dfb = document.getElementById('detailFavBtn');
    if (dfb) {
        dfb.textContent = isNowFav ? '♥ Saved' : '♡ Save Recipe';
        dfb.classList.toggle('active', isNowFav);
    }
}

function updateFavBadge() {
    const count = Object.keys(favorites).length;
    if (count > 0) {
        favBadge.textContent = count;
        favBadge.classList.remove('hidden');
    } else {
        favBadge.classList.add('hidden');
    }
}

function showFavorites() {
    const meals = Object.values(favorites);
    favGrid.innerHTML = '';

    if (meals.length === 0) {
        noFavs.classList.remove('hidden');
    } else {
        noFavs.classList.add('hidden');
        meals.forEach((meal, i) => {
            favGrid.appendChild(createCard(meal, i));
        });
    }

    showView('favorites');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── VIEW SWITCHING ─────────────────────────────────────────
function showView(name) {
    homeView.classList.add('hidden');
    detailView.classList.add('hidden');
    favView.classList.add('hidden');

    if (name === 'home') homeView.classList.remove('hidden');
    if (name === 'detail') detailView.classList.remove('hidden');
    if (name === 'favorites') favView.classList.remove('hidden');
}

function showHome() {
    showView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── SKELETONS ──────────────────────────────────────────────
function showSkeletons() {
    recipeGrid.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        recipeGrid.innerHTML += `
      <div class="skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton skeleton-line w-80"></div>
          <div class="skeleton skeleton-line w-60"></div>
          <div class="skeleton skeleton-line w-40"></div>
        </div>
      </div>`;
    }
    loadMoreWrap.classList.add('hidden');
    noResults.classList.add('hidden');
}

// ── UTILS ──────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}