/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * Horse Gallery Application Script
 * A web app for drawing horses and sharing creations in a gallery.
 */

// Constants
// Constants
// API URL - Yerel ağ (IP ile erişim) ve localhost için aynı sunucuya yönlendir
const isLocalDev = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.startsWith('172.');
const API_BASE_URL = isLocalDev
    ? `${window.location.protocol}//${window.location.hostname}:5005/api`
    : 'https://halfhorse.xyz/api';

const ITEMS_PER_PAGE = 15;
// Set competition end date to be 7 days from when the script is first loaded/run for dynamic demo purposes
// For a fixed date, replace this with: new Date('YYYY-MM-DDTHH:MM:SSZ'); e.g., new Date('2025-06-01T00:00:00Z');
const COMPETITION_END_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);


// Popular emojis for emoji picker
const POPULAR_EMOJIS = [
    '😊', '😂', '❤️', '👍', '🔥', '✨', '🎨', '🐎', '🤩', '😍', '🥰', '😁', '😎',
    '👏', '💪', '🌟', '💯', '🙌', '😄', '🤗', '🥳', '🤔', '🤯', '😱', '🤠', '👀', '💥'
];

/**
 * Application State Variables
 */
// User and drawing state
let currentUser = null;
let currentDrawing = null; // For the drawing being viewed in the modal
let drawing = false; // Canvas drawing state (pen tool)
let isErasing = false;
let isFilling = false; // Paint bucket tool state
let isPenActive = true; // Yeni: Fırça aracının aktif olup olmadığını tutar. Varsayılan olarak aktif.
let lastX, lastY;

// Drawing history and canvas properties
let undoHistory = [];
let redoHistory = [];
let currentColor = '#000000';
let currentBrushSize = 5;
let previewRotation = 0; // For publish modal preview

// Pagination state
let currentPage = 1;
let totalPages = 1;
let currentFilter = 'latest';
let currentSearchQuery = '';

// Admin panel state
let adminUsersCache = [];
let adminDrawingsCache = [];


/**
 * Element References
 * All elements are queried once during initialization
 */
let elements = {};

/**
 * Main Initialization
 */
document.addEventListener('DOMContentLoaded', async function () {
    console.log("DOM loaded");

    cacheElements();
    await checkAuthState(); // Crucial to run before UI updates that depend on user state
    setupModalControls();
    setActiveMainNavLink(); // Set active main navigation link

    // YENİ EKLENEN GUEST ÇİZİM ÖZELLİKLERİ
    loadDrawingFromStorage(); // Çizimi geri yükle
    setupAutoSave(); // Otomatik kaydetmeyi başlat
    checkPublishedState(); // Published durumunu kontrol et

    initializeApp(); // Initialize page-specific functionalities

    setupEventListeners(); // Setup global and page-specific event listeners
    setupImageErrorHandling(); // Resim hata yönetimini başlat


    // Expose functions and critical state to window for inter-script access (e.g., leaderboard.js)
    window.openDrawingView = openDrawingView;
    window.updateLikesAndComments = updateLikesAndComments;
    window.showNotification = showNotification;
    window.closeModal = closeModal;
    window.getCurrentUser = () => currentUser;
    window.API_URL = API_BASE_URL;
    window.ITEMS_PER_PAGE = ITEMS_PER_PAGE;
    window.likeDrawing = likeDrawing;
    window.submitComment = submitComment;
    window.openShareModal = openShareModal;
    window.openReportModal = openReportModal;
    window.getCurrentDrawing = () => currentDrawing;
    window.setCurrentDrawing = (drawingToSet) => { currentDrawing = drawingToSet; };
    window.setupModalControls = setupModalControls; // For leaderboard.js to re-init if needed
    window.checkAuthState = checkAuthState; // For leaderboard.js

    initializeCompetitionElements(); // Initialize competition related UI (banners, countdowns)
    testApiConnection();

    // Load live stats for dashboard
    loadLiveStats();
});

/**
 * Load live platform statistics and animate counters
 */
async function loadLiveStats() {
    const statDrawings = document.getElementById('statDrawings');
    const statUsers = document.getElementById('statUsers');
    const statLikes = document.getElementById('statLikes');

    // Only run on pages with stats dashboard
    if (!statDrawings) return;

    try {
        const response = await fetch(`${API_BASE_URL}/stats`);
        if (response.ok) {
            const stats = await response.json();

            // Animate counters with count-up effect
            animateCounter(statDrawings, stats.totalDrawings);
            animateCounter(statUsers, stats.totalUsers);
            animateCounter(statLikes, stats.totalLikes);

            console.log('Live stats loaded:', stats);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
        // Set fallback values
        if (statDrawings) statDrawings.textContent = '0';
        if (statUsers) statUsers.textContent = '0';
        if (statLikes) statLikes.textContent = '0';
    }
}

/**
 * Animate counter from 0 to target value
 */
function animateCounter(element, target, duration = 1500) {
    if (!element) return;

    const startTime = performance.now();
    const startValue = 0;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out curve for smoother animation
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(startValue + (target - startValue) * easeOut);

        element.textContent = formatNumber(currentValue);
        element.classList.add('counting');

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.classList.remove('counting');
        }
    }

    requestAnimationFrame(update);
}

/**
 * Format number with commas for readability
 */
function formatNumber(num) {
    return num.toLocaleString('en-US');
}

function showSkeleton() {
    // Podium skeleton
    // This function is likely called from leaderboard.js, needs to be defined in leaderboard.js or globally available via window.
    // updatePodium([]); // If updatePodium is a global function from leaderboard.js, it might be called here.
    // For now, removing it from here as it seems to be duplicated with leaderboard.js logic.
    // If leaderboardEntriesEl is defined globally via window from leaderboard.js, it's fine.
    // if (leaderboardEntriesEl) {
    //     leaderboardEntriesEl.innerHTML = createSkeletonList();
    // }
}

function createSkeletonList() {
    let skeletonHTML = '';

    // 17 skeleton row oluştur (4-20. sıra için)
    for (let i = 4; i <= 20; i++) {
        skeletonHTML += `
            <div class="leaderboard-entry skeleton-entry">
                <div class="rank-col">#${i}</div>
                <div class="drawing-col">
                    <div class="skeleton-image shimmer"></div>
                </div>
                <div class="artist-col">
                    <div class="skeleton-artist">
                        <div class="skeleton-avatar shimmer"></div>
                        <div class="skeleton-name shimmer"></div>
                    </div>
                </div>
                <div class="title-col">
                    <div class="skeleton-title shimmer"></div>
                </div>
                <div class="likes-col">
                    <div class="skeleton-likes shimmer"></div>
                </div>
            </div>
        `;
    }

    return skeletonHTML;
}

function hideSkeleton() {
    // This function is likely called from leaderboard.js or related. No change needed here.
}

function showPublishedOverlay() {
    // Overlay'i horse-image container'ının içine ekle, drawing-area'ya değil
    const horseImageContainer = document.querySelector('.horse-image');
    if (horseImageContainer) {
        // Önceki overlay'i temizle
        const existingOverlay = horseImageContainer.querySelector('.published-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.className = 'published-overlay';
        overlay.innerHTML = `
            <div class="published-frame">
                <div class="published-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="published-text">Successfully Published!</div>
                <div class="published-subtext">Your artwork is now in the gallery</div>
                <button onclick="startNewDrawing()" class="primary-btn" style="margin-top: 15px;">
                    <i class="fas fa-plus"></i> Draw New Artwork
                </button>
            </div>
        `;
        horseImageContainer.appendChild(overlay);
    }
}

function startNewDrawing() {
    // Overlay'leri kaldır
    const overlay = document.querySelector('.published-overlay');
    if (overlay) overlay.remove();

    const frameOverlay = document.querySelector('.published-frame-overlay');
    if (frameOverlay) frameOverlay.remove();

    // Canvas'ı temizle
    clearCanvas();

    // Form alanlarını temizle
    if (elements.drawingTitleInput) elements.drawingTitleInput.value = '';
    if (elements.drawingTagsInput) elements.drawingTagsInput.value = '';

    // Drawing area'nın published class'ını kaldır
    const drawingArea = document.querySelector('.drawing-area');
    if (drawingArea) {
        drawingArea.classList.remove('published');
    }

    // Canvas'ı tekrar aktif hale getir
    enableCanvas();

    // User'in published durumunu sıfırla (sadece admin değilse)
    if (currentUser && !currentUser.isAdmin) {
        currentUser.hasPublished = false;
        updateUIForAuthState();
    }

    console.log('New drawing started');
}


function enableCanvas() {
    if (elements.canvas) {
        elements.canvas.style.pointerEvents = 'auto';
        elements.canvas.style.filter = 'none';
    }

    // Tüm çizim araçlarını tekrar aktif hale getir
    const toolButtons = document.querySelectorAll('.action-btn');
    toolButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    });

    if (elements.brushSize) {
        elements.brushSize.disabled = false;
        elements.brushSize.style.opacity = '1';
    }
    if (elements.colorPicker) {
        elements.colorPicker.disabled = false;
        elements.colorPicker.style.opacity = '1';
    }

    // Color button'ları da aktif hale getir
    if (elements.colorButtons) {
        elements.colorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }
}

async function testApiConnection() {
    console.log("Testing API connection...");
    try {
        // Using a generic endpoint like /drawings might be better than /test if /test doesn't exist
        const response = await fetch(`${API_BASE_URL}/drawings?limit=1`); // Fetching one drawing is a light check
        console.log("API Response Status:", response.status);
        if (response.ok) {
            console.log("API connection successful!");
        } else {
            console.error("API connection failed:", response.statusText);
            showNotification(`API connection issue (Status: ${response.status}). Some features might not work.`, 'error');
        }
    } catch (error) {
        console.error("API connection error:", error.message);
        showNotification(`Failed to connect to API: ${error.message}. Please check server.`, 'error');
    }
}

/**
 * Cache DOM Elements for better performance
 */
function cacheElements() {
    // Canvas ve Çizim Araçları Elementleri
    elements.canvas = document.getElementById('drawingCanvas');
    elements.ctx = elements.canvas ? elements.canvas.getContext('2d', { willReadFrequently: true }) : null;
    elements.clearBtn = document.getElementById('clearBtn');
    elements.penBtn = document.getElementById('penBtn');
    elements.redoBtn = document.getElementById('redoBtn');
    elements.undoBtn = document.getElementById('undoBtn');
    elements.eraserBtn = document.getElementById('eraserBtn');
    elements.fillBtn = document.getElementById('fillBtn');
    elements.publishBtn = document.getElementById('publishBtn');
    elements.colorPicker = document.getElementById('colorPicker');
    elements.brushSize = document.getElementById('brushSize');
    elements.brushPreview = document.getElementById('brushPreview');
    elements.decreaseBrushSizeBtn = document.getElementById('decreaseBrushSizeBtn');
    elements.increaseBrushSizeBtn = document.getElementById('increaseBrushSizeBtn');
    elements.colorButtons = document.querySelectorAll('.color-btn');
    elements.horseImage = document.getElementById('half-horse');

    // Header ve Genel Auth/Kullanıcı Bilgileri Elementleri
    elements.usernameDisplay = document.getElementById('usernameDisplay');
    elements.userInfoContainer = document.getElementById('userInfoContainer');
    elements.mainNavigation = document.querySelector('.main-navigation');
    elements.authNavigationContainer = document.getElementById('authNavigationContainer');

    // **KALDIRILAN FORM VE SAYFALARA AİT ELEMENT REFERANSLARI - BU KISIM TEMİZLENDİ**
    // Bu elementler artık HTML'de olmadığı için JavaScript'te de referans tutmuyoruz.
    // elements.forgotPasswordForm = document.getElementById('forgotPasswordForm');
    // elements.forgotEmailInput = document.getElementById('forgotEmail');
    // elements.forgotPasswordError = document.getElementById('forgotPasswordError');
    // elements.forgotPasswordSuccess = document.getElementById('forgotPasswordSuccess');
    // elements.resetPasswordForm = document.getElementById('resetPasswordForm');
    // elements.resetNewPasswordInput = document.getElementById('newPassword');
    // elements.resetConfirmNewPasswordInput = document.getElementById('confirmNewPassword');
    // elements.resetPasswordError = document.getElementById('resetPasswordError');
    // elements.resetPasswordSuccess = document.getElementById('resetPasswordSuccess');
    // elements.resetInfoText = document.getElementById('resetInfoText');
    // elements.loginForm = document.getElementById('loginForm');
    // elements.loginUsernameInput = document.getElementById('loginUsername');
    // elements.signupForm = document.getElementById('signupForm');
    // elements.loginError = document.getElementById('loginError');
    // elements.signupError = document.getElementById('signupError');
    // elements.changePasswordForm = document.getElementById('changePasswordForm');
    // elements.changePasswordError = document.getElementById('changePasswordError');

    // Profil Sayfası Elementleri
    elements.profileAvatarImage = document.getElementById('profileAvatarImage');
    elements.profileAvatarUpload = document.getElementById('profileAvatarUpload');
    elements.profileUsernameDisplay = document.getElementById('profileUsernameDisplay');
    elements.profileEmailDisplay = document.getElementById('profileEmailDisplay');
    elements.updateProfileForm = document.getElementById('updateProfileForm');
    elements.profileBio = document.getElementById('profileBio');
    elements.profilePageLogoutBtn = document.querySelector('.profile-section #logoutBtn');
    elements.updateProfileError = document.getElementById('updateProfileError');

    // Galeri ve Filtreleme Elementleri
    elements.gallery = document.getElementById('gallery');
    elements.filterBar = document.querySelector('.filter-bar');
    elements.filterOptions = document.querySelector('.filter-options');
    elements.filterButtons = document.querySelectorAll('.filter-btn');
    elements.searchBtn = document.getElementById('searchBtn');
    elements.searchInput = document.getElementById('searchInput');
    elements.prevPageBtn = document.getElementById('prevPageBtn');
    elements.nextPageBtn = document.getElementById('nextPageBtn');
    elements.pageInfo = document.getElementById('pageInfo');

    // Son Çizimler, Emoji ve Modallar
    elements.recentDrawingsContainer = document.getElementById('recentDrawingsContainer');
    elements.emojiList = document.getElementById('emojiList');
    elements.emojiPickerBtn = document.getElementById('emojiPickerBtn');

    elements.tutorialModal = document.getElementById('tutorialModal');
    elements.publishModal = document.getElementById('publishModal');
    elements.drawingPreview = document.getElementById('drawingPreview');
    elements.drawingTitleInput = document.getElementById('drawingTitle');
    elements.drawingTagsInput = document.getElementById('drawingTagsInput');
    elements.confirmPublishBtn = document.getElementById('confirmPublishBtn');
    elements.rotatePreviewLeftBtn = document.getElementById('rotatePreviewLeftBtn');
    elements.rotatePreviewRightBtn = document.getElementById('rotatePreviewRightBtn');
    elements.backToDrawingBtn = document.getElementById('backToDrawingBtn');

    elements.viewDrawingModal = document.getElementById('viewDrawingModal');
    elements.viewDrawingTitle = document.getElementById('viewDrawingTitle');
    elements.viewDrawingCreator = document.getElementById('viewDrawingCreator');
    elements.creatorAvatar = document.getElementById('creatorAvatar');
    elements.viewDrawingImage = document.getElementById('viewDrawingImage');
    elements.drawingDate = document.getElementById('drawingDate');
    elements.drawingModalTags = document.getElementById('drawingModalTags');
    elements.likeDrawingBtn = document.getElementById('likeDrawingBtn');
    elements.likeCount = document.getElementById('likeCount');
    elements.commentsList = document.getElementById('commentsList');
    elements.commentInput = document.getElementById('commentInput');
    elements.submitCommentBtn = document.getElementById('submitCommentBtn');
    elements.userCommentAvatar = document.getElementById('userCommentAvatar');

    elements.shareDrawingBtn = document.getElementById('shareDrawingBtn');
    elements.reportDrawingBtn = document.getElementById('reportDrawingBtn');
    elements.shareModal = document.getElementById('shareModal');
    elements.shareLink = document.getElementById('shareLink');
    elements.copyLinkBtn = document.getElementById('copyLinkBtn');
    elements.reportModal = document.getElementById('reportModal');
    elements.reportForm = document.getElementById('reportForm');
    elements.reportReason = document.getElementById('reportReason');
    elements.reportDescription = document.getElementById('reportDescription');
    elements.submitReportBtn = document.getElementById('submitReportBtn');

    // Admin Paneli Elementleri
    elements.adminPanelContainer = document.querySelector('.admin-panel-container');
    elements.adminUserSearch = document.getElementById('adminUserSearch');
    elements.adminRefreshUsersBtn = document.getElementById('adminRefreshUsersBtn');
    elements.adminUsersTableBody = document.getElementById('adminUsersTableBody');
    elements.adminDrawingSearch = document.getElementById('adminDrawingSearch');
    elements.adminRefreshDrawingsBtn = document.getElementById('adminRefreshDrawingsBtn');
    elements.adminDrawingsTableBody = document.getElementById('adminDrawingsTableBody');
    elements.adminResetGalleryBtn = document.getElementById('adminResetGalleryBtn');

    // Yarışma Elementleri
    elements.competitionBannerCollapsible = document.getElementById('competitionBannerCollapsible');
    elements.bannerHeaderClickable = document.getElementById('bannerHeaderClickable');
    elements.bannerDetailsCollapsible = document.getElementById('bannerDetailsCollapsible');
    elements.competitionEndDateEl = document.getElementById('competitionEndDate');
    elements.competitionCountdownTimerEl = document.getElementById('competitionCountdownTimer');
    elements.competitionLeaderboardCountdownEl = document.getElementById('competitionLeaderboardCountdown');
    elements.rulesPageCountdownTimerEl = document.getElementById('competitionRulesCountdownTimer');
}

// Only add drawing tool event listeners if on a page with these elements
if (elements.colorPicker) {
    elements.colorPicker.addEventListener('input', (e) => {
        currentColor = e.target.value;
        activatePenMode();
        elements.colorButtons.forEach(btn => btn.classList.remove('active'));
        updateBrushPreview();
    });
}

if (elements.colorButtons && elements.colorButtons.length > 0) {
    elements.colorButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentColor = button.dataset.color;
            activatePenMode();
            elements.colorButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            updateBrushPreview();
        });
    });
}

if (elements.eraserBtn) {
    elements.eraserBtn.addEventListener('click', () => {
        isErasing = !isErasing;
        isFilling = false;
        isPenActive = false;
        elements.eraserBtn.classList.toggle('active', isErasing);
        if (elements.fillBtn) elements.fillBtn.classList.remove('active');
        elements.colorButtons.forEach(btn => btn.classList.remove('active'));
        if (elements.brushSize) elements.brushSize.disabled = false;
        if (elements.canvas) {
            if (isErasing) {
                elements.canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 11.5h19v3h-19z"/><path d="M8.5 8.5l7 7"/><path d="M15.5 8.5l-7 7"/></svg>') 12 12, crosshair`;
            } else {
                activatePenMode();
            }
        }
        updateBrushPreview();
    });
}

if (elements.fillBtn) {
    elements.fillBtn.addEventListener('click', () => {
        isFilling = !isFilling;
        isErasing = false;
        isPenActive = false;
        elements.fillBtn.classList.toggle('active', isFilling);
        if (elements.eraserBtn) elements.eraserBtn.classList.remove('active');
        elements.colorButtons.forEach(btn => btn.classList.remove('active'));
        if (elements.brushSize) elements.brushSize.disabled = isFilling;
        if (elements.canvas) {
            if (isFilling) {
                elements.canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 13h-2.5v-2.5H11v2.5H8.5V14H11v-2.5h2.5V14H16v2zm0-5.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v3.5zM5 19V5h14v14H5z"/><path d="M0 0h24v24H0z" fill="none"/><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>') 12 12, crosshair`;
            } else {
                activatePenMode();
            }
        }
        updateBrushPreview();
    });
}

function getRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);

    if (diffInSeconds < 30) return 'Just now';
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
        return diffInWeeks === 1 ? '1 week ago' : `${diffInWeeks} weeks ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
        return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`;
    }

    const diffInYears = Math.floor(diffInMonths / 12);
    return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`;
}

/**
 * Set active main navigation link based on current page
 */
function setActiveMainNavLink() {
    const mainNavLinks = document.querySelectorAll('header .main-navigation .nav-link');
    if (!mainNavLinks) return;

    let currentPageName = window.location.pathname.split('/').pop();
    if (currentPageName === '') {
        currentPageName = 'index.html';
    }

    mainNavLinks.forEach(link => {
        link.classList.remove('active');
        const linkHrefName = link.getAttribute('href').split('/').pop();

        if (currentPageName === linkHrefName) {
            link.classList.add('active');
        }
    });
}

function activatePenMode() {
    isPenActive = true;
    isErasing = false;
    isFilling = false;
    if (elements.eraserBtn) elements.eraserBtn.classList.remove('active');
    if (elements.fillBtn) elements.fillBtn.classList.remove('active');
    if (elements.brushSize) elements.brushSize.disabled = false; // Fırça modunda fırça boyutunu etkinleştir
    if (elements.canvas) elements.canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" fill="black" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6"/></svg>') 8 8, crosshair`;
    updateBrushPreview();
}

/**
 * Show tutorial modal on first visit
 */
function showTutorialModal() {
    // İlk ziyarette tutorial göster
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial && elements.tutorialModal) {
        elements.tutorialModal.classList.add('active');

        // Start Drawing butonuna click listener ekle
        const startDrawingBtn = document.getElementById('startDrawingBtn');
        const closeTutorialBtn = document.getElementById('closeTutorialBtn');

        const closeTutorial = () => {
            elements.tutorialModal.classList.remove('active');
            localStorage.setItem('hasSeenTutorial', 'true');
        };

        if (startDrawingBtn) {
            startDrawingBtn.addEventListener('click', closeTutorial);
        }
        if (closeTutorialBtn) {
            closeTutorialBtn.addEventListener('click', closeTutorial);
        }
    }
}

/**
 * Initialize the application based on the current page
 */
async function initializeApp() {
    const path = window.location.pathname;
    const pageName = path.substring(path.lastIndexOf('/') + 1);

    if (pageName === 'index.html' || pageName === '' && elements.canvas) {
        setupCanvas();
        activatePenMode();
        updateBrushPreview();
        showTutorialModal();
        loadRecentDrawings();

        // Canvas hazır olduktan sonra guest drawing'i yükle
        setTimeout(() => {
            loadDrawingFromStorage();
        }, 200);
    }

    if (pageName === 'gallery.html' && elements.gallery) {
        loadDrawings(currentFilter, currentSearchQuery);
    }

    if (pageName === 'profile.html') {
        loadProfileData();
    }

    if (pageName === 'admin.html') {
        initializeAdminPanel();
    }

    if (elements.emojiList && elements.emojiPickerBtn) {
        setupEmojiPicker();
    }
    updateUIForAuthState();
}

/**
 * User Authentication & Management Functions
 */

function startGoogleLogin() {
    window.location.href = `${API_BASE_URL}/auth/google?v=${new Date().getTime()}`;
}

function startTwitterLogin() {
    window.location.href = `${API_BASE_URL}/auth/twitter?v=${new Date().getTime()}`;
}

async function startGuestLogin() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/guest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success && data.token) {
            localStorage.setItem('authToken', data.token);
            // Redirect to homepage
            window.location.href = 'index.html';
        } else {
            alert('Guest login failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Guest login error detailed:', error);
        alert('Guest login error. Check console for details. Make sure backend is running at ' + API_BASE_URL);
    }
}

async function checkAuthState() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            console.log('Checking auth state with token');

            const response = await fetch(`${API_BASE_URL}/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                currentUser = await response.json();
                console.log('User authenticated:', currentUser.username);

                // Sadece comment avatar'ını güncelle (modal'larda kullanım için)
                if (elements.userCommentAvatar) {
                    elements.userCommentAvatar.src = currentUser.avatar || 'assets/default-avatar.png';
                }

            } else {
                console.log('Token invalid, removing from storage');
                localStorage.removeItem('authToken');
                currentUser = null;
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            localStorage.removeItem('authToken');
            currentUser = null;
        }
    } else {
        currentUser = null;
    }

    updateNavigation();
    updateUIForAuthState();

    // Auth state değiştikten sonra guest drawing'i kontrol et
    if (currentUser) {
        setTimeout(() => {
            const savedDrawing = localStorage.getItem('guestDrawing');
            if (savedDrawing && elements.canvas) {
                console.log('User logged in with saved guest drawing, restoring...');
                loadDrawingFromStorage();
            }
        }, 300);
    }
}

function setupImageErrorHandling() {
    // Tüm resim elementlerini hedefleyin
    const imageElements = document.querySelectorAll('img'); // Tüm img etiketlerini seçin

    imageElements.forEach(img => {
        img.onerror = function () {
            // Eğer resim yüklenemezse, default-avatar.png'ye veya placeholder'a geç
            // console.log('Resim yüklenemedi:', this.src); // Debug için
            if (this.src.includes('/uploads/')) { // Sadece uploads'dan gelen resimlerde hata varsa
                this.src = 'assets/default-drawing-placeholder.png'; // Çizimler için özel bir placeholder kullanabilirsiniz
                // Ya da: this.src = 'assets/broken-image.png';
            } else if (this.src.includes('avatar') || this.classList.contains('profile-avatar-img') || this.classList.contains('comment-avatar')) {
                this.src = 'assets/default-avatar.png'; // Avatar resimleri için
            }
            // Hata yönetimini sadece bir kez çalıştırmak için
            this.onerror = null;
        };
    });
}


function updateNavigation() {
    // Gerekli DOM elementlerinin varlığını kontrol et
    if (!elements.authNavigationContainer || !elements.usernameDisplay || !elements.userInfoContainer) {
        console.warn("One or more required navigation elements not found. Skipping navigation update.");
        return;
    }

    // Auth navigasyon container'ını temizle (eski butonları sil)
    elements.authNavigationContainer.innerHTML = '';

    // Mevcut sayfa adını al
    const currentPageName = window.location.pathname.split('/').pop() || 'index.html';

    // Kullanıcı giriş yapmışsa
    if (currentUser) {
        // Kullanıcı adını göster
        elements.usernameDisplay.textContent = currentUser.username;
        elements.userInfoContainer.style.display = 'block'; // Kullanıcı bilgisi container'ını görünür yap

        // Ekran genişliğine göre mobil veya masaüstü davranışı ayarla
        const isMobile = window.innerWidth <= 900; // Style.css'deki mobil breakpoint ile uyumlu

        if (isMobile) {
            // Mobilde: Sadece ikon butonları (Profile ve Logout)
            elements.userInfoContainer.style.cursor = 'default'; // Kullanıcı adı tıklanabilir olmasın
            elements.userInfoContainer.onclick = null;

            // Mobil Profil Butonu
            const profileButton = document.createElement('button');
            profileButton.className = 'nav-link mobile-profile-btn';
            if (currentPageName === 'profile.html') {
                profileButton.classList.add('active'); // Profil sayfasındaysa aktif işaretle
            }
            profileButton.innerHTML = `<i class="fas fa-user"></i>`;
            profileButton.title = 'Profile';
            profileButton.addEventListener('click', () => {
                window.location.href = 'profile.html'; // Profil sayfasına yönlendir
            });

            // Mobil Logout Butonu
            const logoutButton = document.createElement('button');
            logoutButton.id = 'headerLogoutBtn'; // ID ver
            logoutButton.className = 'nav-link mobile-logout-btn';
            logoutButton.innerHTML = `<i class="fas fa-sign-out-alt"></i>`;
            logoutButton.title = 'Logout';
            logoutButton.addEventListener('click', handleLogout); // Logout fonksiyonunu çağır

            elements.authNavigationContainer.appendChild(profileButton);
            elements.authNavigationContainer.appendChild(logoutButton);

        } else {
            // Masaüstünde: Kullanıcı adı tıklanabilir olsun (Profile sayfasına yönlendirir)
            elements.userInfoContainer.style.cursor = 'pointer';
            elements.userInfoContainer.onclick = () => {
                window.location.href = 'profile.html'; // Profil sayfasına yönlendir
            };

            // Masaüstü Logout Butonu (mobil dışında)
            const logoutButton = document.createElement('button');
            logoutButton.id = 'headerLogoutBtn'; // ID ver
            logoutButton.className = 'nav-link logout-button';
            logoutButton.innerHTML = `<i class="fas fa-sign-out-alt"></i> Logout`;
            logoutButton.addEventListener('click', handleLogout); // Logout fonksiyonunu çağır
            elements.authNavigationContainer.appendChild(logoutButton);
        }

        // Admin linki (her durumda gösterilir, eğer kullanıcı admin ise)
        if (currentUser.isAdmin) {
            const adminLink = document.createElement('a');
            adminLink.href = 'admin.html';
            adminLink.className = 'nav-link admin-link';
            if (currentPageName === 'admin.html') {
                adminLink.classList.add('active'); // Admin sayfasındaysa aktif işaretle
            }
            adminLink.innerHTML = `<i class="fas fa-shield-alt"></i> Admin`;
            elements.authNavigationContainer.appendChild(adminLink);
        }

    } else {
        // Kullanıcı giriş yapmamışsa (Guest durumu)
        elements.usernameDisplay.textContent = 'Guest'; // Guest yazısı
        elements.userInfoContainer.style.display = 'block'; // Kullanıcı bilgisi container'ını görünür yap
        elements.userInfoContainer.style.cursor = 'default'; // Tıklanabilir olmasın
        elements.userInfoContainer.onclick = null; // Event listener'ı kaldır

        // Sadece sosyal girişlerin olduğu 'login.html' sayfasına yönlendirecek tek bir Login butonu
        const loginButton = document.createElement('a');
        loginButton.href = 'login.html'; // login.html artık sosyal giriş sayfası
        loginButton.className = 'nav-link login-link';
        // Eğer mevcut sayfa giriş, kayıt, şifremi unuttum veya şifre sıfırlama sayfalarından biriyse aktif yap
        // (Bu sayfaların hepsi artık tek bir sosyal giriş akışının parçası olarak görülebilir)
        if (['login.html', 'signup.html', 'forgot-password.html', 'reset-password.html'].includes(currentPageName)) {
            loginButton.classList.add('active');
        }
        loginButton.innerHTML = `<i class="fas fa-sign-in-alt"></i> Login`;
        elements.authNavigationContainer.appendChild(loginButton);
    }
}

function updateUIForAuthState() {
    if (elements.publishBtn) {
        if (currentUser) {
            const cannotPublish = currentUser.hasPublished && !currentUser.isAdmin;
            elements.publishBtn.disabled = cannotPublish;
            elements.publishBtn.style.opacity = cannotPublish ? '0.5' : '1';
            elements.publishBtn.style.cursor = cannotPublish ? 'not-allowed' : 'pointer';
            elements.publishBtn.title = cannotPublish ? 'You have already published one drawing for this week\'s competition.' : 'Publish your drawing!';
        } else {
            elements.publishBtn.disabled = true;
            elements.publishBtn.style.opacity = '0.5';
            elements.publishBtn.style.cursor = 'not-allowed';
            elements.publishBtn.title = 'Login to publish your drawing.';
        }
    }

    const viewModalElementsToToggle = [elements.likeDrawingBtn, elements.submitCommentBtn, elements.commentInput, elements.emojiPickerBtn, elements.reportDrawingBtn];
    viewModalElementsToToggle.forEach(el => {
        if (el) {
            const isDisabled = !currentUser;
            el.disabled = isDisabled;
            el.style.opacity = isDisabled ? '0.5' : '1';
            el.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
            if (el.placeholder && el.id === 'commentInput') {
                el.placeholder = isDisabled ? "Login to comment..." : "Write a comment...";
            }
            if (el.id === 'reportDrawingBtn' && isDisabled) {
                el.title = "Login to report drawings";
            } else if (el.id === 'reportDrawingBtn') {
                el.title = "";
            }
        }
    });

    if (elements.userCommentAvatar) {
        elements.userCommentAvatar.src = currentUser?.avatar || 'assets/default-avatar.png';
    }
}


// handleLogin ve handleSignup fonksiyonları kaldırıldı (sosyal girişlere geçildiği için)
// handleForgotPassword ve handleResetPassword fonksiyonları kaldırıldı
// handleChangePassword fonksiyonu kaldırıldı

function handleLogout() {
    localStorage.removeItem('authToken');
    currentUser = null;
    showNotification('Logged out successfully.', 'info');

    // Canvas'ı temizle ve published durumunu kaldır
    clearPublishedState();

    // SADECE LOGOUT DURUMUNDA guest çizimini sil
    localStorage.removeItem('guestDrawing');
    console.log('Guest drawing cleared after logout');

    // UI'ı güncelle
    updateNavigation();
    setActiveMainNavLink();
    updateUIForAuthState();

    // Restricted sayfalarda ana sayfaya yönlendir
    const restrictedPages = ['profile.html', 'admin.html'];
    const currentPageName = window.location.pathname.split('/').pop();
    if (restrictedPages.some(page => currentPageName === page)) {
        window.location.href = 'index.html';
    } else {
        // Ana sayfadaysa sayfayı yenile
        if (currentPageName === 'index.html' || currentPageName === '') {
            window.location.reload();
        }
    }
}

function clearPublishedState() {
    // Canvas'ı temizle
    if (elements.canvas && elements.ctx) {
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = elements.canvas.clientWidth;
        const cssHeight = elements.canvas.clientHeight;
        elements.ctx.clearRect(0, 0, cssWidth, cssHeight);

        // Canvas'ı tekrar aktif hale getir
        enableCanvas();

        // Canvas state'ini kaydet
        saveCanvasState();
    }

    // Published overlay'leri kaldır
    const publishedOverlay = document.querySelector('.published-overlay');
    if (publishedOverlay) publishedOverlay.remove();

    const publishedFrameOverlay = document.querySelector('.published-frame-overlay');
    if (publishedFrameOverlay) publishedFrameOverlay.remove();

    // Drawing area'nın published class'ını kaldır
    const drawingArea = document.querySelector('.drawing-area');
    if (drawingArea) {
        drawingArea.classList.remove('published');
    }

    // Form alanlarını temizle
    if (elements.drawingTitleInput) elements.drawingTitleInput.value = '';
    if (elements.drawingTagsInput) elements.drawingTagsInput.value = '';

    console.log('Published state cleared after logout');
}

async function loadProfileData() {
    if (!currentUser) {
        showNotification('Please login to view your profile.', 'error');
        window.location.href = 'login.html';
        return;
    }

    console.log('Loading profile data for user:', currentUser.username); // Debug
    console.log('User avatar URL:', currentUser.avatar); // Debug

    if (elements.profileUsernameDisplay) {
        elements.profileUsernameDisplay.textContent = currentUser.username;
    }
    if (elements.profileEmailDisplay) {
        elements.profileEmailDisplay.textContent = currentUser.email;
    }
    if (elements.profileAvatarImage) {
        // Cache bust ekle
        const avatarUrl = currentUser.avatar || 'assets/default-avatar.png';
        const urlWithCacheBust = avatarUrl + (avatarUrl.includes('?') ? '&' : '?') + 't=' + Date.now();

        console.log('Setting avatar image src to:', urlWithCacheBust); // Debug

        elements.profileAvatarImage.src = urlWithCacheBust;

        // Error handling ekle
        elements.profileAvatarImage.onerror = function () {
            console.log('Avatar failed to load, using default'); // Debug
            this.src = 'assets/default-avatar.png';
        };

        elements.profileAvatarImage.onload = function () {
            console.log('Avatar loaded successfully'); // Debug
        };
    }
    if (elements.profileBio) {
        elements.profileBio.value = currentUser.bio || '';
    }
}

async function handleUpdateProfile(event) {
    event.preventDefault();
    if (!currentUser || !elements.updateProfileForm || !elements.updateProfileError) return;
    elements.updateProfileError.textContent = '';
    elements.updateProfileError.style.display = 'none';

    const bio = elements.profileBio.value;
    const formData = new FormData();
    formData.append('bio', bio);

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/users/me/profile`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            if (data.token) localStorage.setItem('authToken', data.token);
            showNotification('Profile updated successfully!', 'success');
            loadProfileData();
            updateNavigation();
            setActiveMainNavLink();
        } else {
            elements.updateProfileError.textContent = data.message || 'Failed to update profile.';
            elements.updateProfileError.style.display = 'block';
        }
    } catch (error) {
        elements.updateProfileError.textContent = 'An error occurred while updating profile.';
        elements.updateProfileError.style.display = 'block';
    }
}

async function handleProfilePictureUpload(event) {
    if (!currentUser || !elements.profileAvatarUpload || !elements.updateProfileError) return;

    console.log('Profile picture upload started'); // Debug

    elements.updateProfileError.style.display = 'none';
    const file = event.target.files[0];

    if (!file) {
        console.log('No file selected');
        return;
    }

    console.log('Selected file:', file.name, file.size, file.type); // Debug

    // Dosya boyutu kontrolü (3MB)
    if (file.size > 3 * 1024 * 1024) {
        elements.updateProfileError.textContent = 'File too large. Maximum size is 3MB.';
        elements.updateProfileError.style.display = 'block';
        return;
    }

    // Dosya tipi kontrolü
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        elements.updateProfileError.textContent = 'Invalid file type. Please select a JPG, PNG, or GIF image.';
        elements.updateProfileError.style.display = 'block';
        return;
    }

    // Loading state göster
    if (elements.profileAvatarImage) {
        elements.profileAvatarImage.style.opacity = '0.5';
    }

    const formData = new FormData();
    formData.append('avatar', file);

    // Bio'yu da ekle (mevcut bio'yu korumak için)
    if (elements.profileBio && elements.profileBio.value) {
        formData.append('bio', elements.profileBio.value);
    }

    try {
        const token = localStorage.getItem('authToken');
        console.log('Sending request to update profile with file'); // Debug

        const response = await fetch(`${API_BASE_URL}/users/me/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
                // Content-Type'ı EKLEME! FormData kendi ekler
            },
            body: formData
        });

        console.log('Response status:', response.status); // Debug
        console.log('Response headers:', response.headers); // Debug

        const data = await response.json();
        console.log('Response data:', data); // Debug

        if (response.ok) {
            // currentUser'ı güncelle
            currentUser = data.user;

            // Token'ı güncelle
            if (data.token) {
                localStorage.setItem('authToken', data.token);
            }

            console.log('Profile updated, new avatar URL:', currentUser.avatar); // Debug

            // UI'ı güncelle - CACHE BUST ile
            updateAvatarImages(currentUser.avatar);

            showNotification('Profile picture updated successfully!', 'success');

        } else {
            // Hata durumu
            elements.profileAvatarImage.style.opacity = '1';
            elements.updateProfileError.textContent = data.message || 'Failed to upload image. Please try again.';
            elements.updateProfileError.style.display = 'block';
        }
    } catch (error) {
        console.error('Upload error:', error);
        elements.profileAvatarImage.style.opacity = '1';
        elements.updateProfileError.textContent = 'Network error. Please check your connection and try again.';
        elements.updateProfileError.style.display = 'block';
    }
}

function updateAvatarImages(newAvatarUrl) {
    // URL'nin sorgu parametresi varsa ayır, yoksa tamamını al.
    // Bu, URL'nin dosya uzantısını korur.
    const urlBase = newAvatarUrl ? newAvatarUrl.split('?')[0] : 'assets/default-avatar.png';
    const cacheBustUrl = urlBase + '?t=' + Date.now();

    console.log('Updating avatar images with (calculated cacheBustUrl):', cacheBustUrl); // Debug

    // Profil sayfasındaki avatar (id="profileAvatarImage")
    if (elements.profileAvatarImage) {
        elements.profileAvatarImage.src = cacheBustUrl;
        console.log('profileAvatarImage src set to:', elements.profileAvatarImage.src); // Debug
        elements.profileAvatarImage.style.opacity = '1';

        elements.profileAvatarImage.onload = function () {
            console.log('Profile avatar loaded successfully'); // Debug
        };

        elements.profileAvatarImage.onerror = function () {
            console.log('Profile avatar failed to load, using default (onerror triggered)'); // Debug
            this.src = 'assets/default-avatar.png';
            this.style.opacity = '1';
        };
    }

    // Comment form'daki avatar (id="userCommentAvatar")
    if (elements.userCommentAvatar) {
        elements.userCommentAvatar.src = cacheBustUrl;
        console.log('userCommentAvatar src set to:', elements.userCommentAvatar.src); // Debug
        elements.userCommentAvatar.onerror = function () {
            console.log('Comment avatar failed to load, using default (onerror triggered)'); // Debug
            this.src = 'assets/default-avatar.png';
        };
    }

    // CurrentUser objesini güncelle (içinde cache bust parametresi olmayan temiz URL kalsın)
    if (currentUser) {
        currentUser.avatar = urlBase;
    }

    // Diğer tüm avatar elementleri (örn: galeri, leaderboard)
    // Sadece Twitter veya kendi yüklediğimiz (uploads) avatarları hedefle.
    // data-user-id özniteliği kullananlar veya img src'sinde kullanıcının id'sini içerenler daha iyi hedeflenebilir.
    const allRelevantAvatars = document.querySelectorAll(`img[src*="profile_images"], img[src*="uploads"]`);
    allRelevantAvatars.forEach(img => {
        // Eğer bu img, zaten elements objesinde doğrudan referanslanan bir avatar değilse (daha önce güncellediysek atla)
        if (img !== elements.profileAvatarImage && img !== elements.userCommentAvatar) {
            // Sadece gerçekten bir URL'si varsa ve varsayılan değilse güncellemeye çalış
            if (img.src && !img.src.includes('default-avatar.png')) {
                img.src = cacheBustUrl;
                console.log('Updated other avatar src to:', img.src); // Debug
                img.onerror = function () {
                    console.log('Other avatar failed to load, using default (onerror triggered)'); // Debug
                    this.src = 'assets/default-avatar.png';
                };
            }
        }
    });
}

function forceRefreshAvatars() {
    if (currentUser && currentUser.avatar) {
        console.log('Force refreshing avatars for user:', currentUser.username);

        // URL'nin sorgu parametresi varsa ayır, dosya uzantısını koru.
        const urlBase = currentUser.avatar.split('?')[0];
        const cacheBustUrl = urlBase + '?t=' + Date.now();

        console.log('Calculated cacheBustUrl for force refresh:', cacheBustUrl); // Debug

        // Profil sayfasındaki avatar
        if (elements.profileAvatarImage) {
            elements.profileAvatarImage.src = cacheBustUrl;
            console.log('profileAvatarImage src set to (force):', elements.profileAvatarImage.src); // Debug
            elements.profileAvatarImage.style.opacity = '1';
        }

        // Comment avatar
        if (elements.userCommentAvatar) {
            elements.userCommentAvatar.src = cacheBustUrl;
            console.log('Updated comment avatar (force):', cacheBustUrl);
        }

        // Diğer tüm avatar elementleri (galeri, leaderboard, vb.)
        const allRelevantAvatars = document.querySelectorAll(`img[src*="profile_images"], img[src*="uploads"]`);
        allRelevantAvatars.forEach(img => {
            if (img !== elements.profileAvatarImage && img !== elements.userCommentAvatar) {
                if (img.src && !img.src.includes('default-avatar.png')) {
                    img.src = cacheBustUrl;
                    console.log('Updated gallery/leaderboard/other avatar (force):', img.src); // Debug
                }
            }
        });

        // CurrentUser nesnesini güncelle (temiz URL ile)
        currentUser.avatar = urlBase;
    } else {
        console.log('forceRefreshAvatars: currentUser or avatar is null. Skipping refresh.');
    }
}

// Sayfa yüklendiğinde avatarları zorla yenile
document.addEventListener('DOMContentLoaded', function () {
    // Diğer initialization kodlarından sonra
    setTimeout(() => {
        if (currentUser) {
            forceRefreshAvatars();
        }
    }, 1000); // 1 saniye bekle ki diğer elementler yüklensin
});

// handleChangePassword, handleForgotPassword, handleResetPassword fonksiyonları KALDIRILDI

/**
 * Modal Control Functions
 */
function setupModalControls() {
    const modalsConfig = [
        { modalId: 'tutorialModal', closeBtnId: 'closeTutorialBtn', backBtnId: 'startDrawingBtn' },
        { modalId: 'publishModal', closeBtnId: 'closePublishBtn', backBtnId: 'backToDrawingBtn' },
        { modalId: 'viewDrawingModal', closeBtnId: 'closeViewModalBtn' },
        { modalId: 'shareModal', closeBtnId: 'closeShareBtn' },
        { modalId: 'reportModal', closeBtnId: 'closeReportBtn', backBtnId: 'cancelReportBtn' }
    ];

    modalsConfig.forEach(config => {
        const modalElement = document.getElementById(config.modalId);
        if (!modalElement) return;

        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement || e.target.classList.contains('modal-overlay')) {
                closeModal(modalElement);
            }
        });

        const closeBtn = document.getElementById(config.closeBtnId);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeModal(modalElement));
        }

        if (config.backBtnId) {
            const backBtn = document.getElementById(config.backBtnId);
            if (backBtn) {
                backBtn.addEventListener('click', () => closeModal(modalElement));
            }
        }
    });
}

function closeModal(modalElementOrId) {
    const modalElement = typeof modalElementOrId === 'string' ? document.getElementById(modalElementOrId) : modalElementOrId;
    if (modalElement) {
        modalElement.style.display = 'none';
        if (modalElement.id === 'viewDrawingModal' && window.location.hash.startsWith('#drawing=')) {
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
    }
}

function showTutorialModal() {
    if (!elements.tutorialModal) return;
    if (localStorage.getItem('hasSeenTutorial') === 'true') return;
    elements.tutorialModal.style.display = 'flex';
    localStorage.setItem('hasSeenTutorial', 'true');
}

/**
 * Canvas Setup and Drawing Functions
 */
function setupCanvas() {
    if (!elements.canvas || !elements.ctx) {
        console.log('Canvas elements not found');
        return;
    }

    console.log('Setting up canvas...');

    // Canvas boyutunu ayarla
    setCanvasSize();

    // Canvas context özelliklerini ayarla
    elements.ctx.lineCap = 'round';
    elements.ctx.lineJoin = 'round';
    elements.ctx.strokeStyle = currentColor;
    elements.ctx.lineWidth = currentBrushSize;

    // İlk state'i kaydet
    saveCanvasState();

    // Varsayılan cursor
    elements.canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" fill="black" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6"/></svg>') 8 8, crosshair`;

    console.log('Canvas setup complete');

    // Canvas setup tamamlandıktan sonra guest drawing'i yükle
    // Daha agresif bir retry mekanizması
    attemptGuestDrawingRestore();
}

function attemptGuestDrawingRestore() {
    const savedDrawing = localStorage.getItem('guestDrawing');
    if (!savedDrawing) {
        console.log('No guest drawing found in localStorage');
        return;
    }

    try {
        const data = JSON.parse(savedDrawing);
        console.log('Guest drawing data found:', {
            hasImageData: !!data.imageData,
            imageDataLength: data.imageData ? data.imageData.length : 0,
            title: data.title,
            tags: data.tags,
            timestamp: new Date(data.timestamp).toLocaleString()
        });

        if (data.imageData) {
            console.log('Attempting to restore guest drawing...');
            restoreGuestDrawing(data);
        }
    } catch (error) {
        console.error('Error parsing guest drawing data:', error);
        localStorage.removeItem('guestDrawing');
    }
}

function restoreGuestDrawing(data) {
    let retryCount = 0;
    const maxRetries = 10; // Daha fazla retry

    const attemptRestore = () => {
        retryCount++;
        console.log(`Restore attempt ${retryCount}/${maxRetries}`);

        // Canvas elemanlarını kontrol et
        if (!elements.canvas || !elements.ctx) {
            console.log('Canvas not ready, elements check:', {
                hasCanvas: !!elements.canvas,
                hasCtx: !!elements.ctx
            });

            if (retryCount < maxRetries) {
                setTimeout(attemptRestore, 200);
            } else {
                console.error('Max retries reached, canvas not ready');
            }
            return;
        }

        // Canvas boyutlarını kontrol et
        const rect = elements.canvas.getBoundingClientRect();
        console.log('Canvas dimensions:', {
            clientWidth: elements.canvas.clientWidth,
            clientHeight: elements.canvas.clientHeight,
            canvasWidth: elements.canvas.width,
            canvasHeight: elements.canvas.height,
            rectWidth: rect.width,
            rectHeight: rect.height
        });

        // Canvas boyutları sıfırsa bekle
        if (elements.canvas.clientWidth === 0 || elements.canvas.clientHeight === 0 ||
            rect.width === 0 || rect.height === 0) {
            console.log('Canvas dimensions are 0, waiting...');
            if (retryCount < maxRetries) {
                setTimeout(attemptRestore, 50);
            }
            return;
        }

        // Canvas boyutunu yeniden ayarla (garantiye almak için)
        setCanvasSize();

        // Image yükle ve restore et
        const img = new Image();
        img.onload = () => {
            try {
                console.log('Image loaded successfully, dimensions:', {
                    imgWidth: img.width,
                    imgHeight: img.height,
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight
                });

                // Canvas boyutlarını tekrar al
                const cssWidth = elements.canvas.clientWidth;
                const cssHeight = elements.canvas.clientHeight;

                console.log('Drawing with dimensions:', {
                    cssWidth,
                    cssHeight,
                    canvasWidth: elements.canvas.width,
                    canvasHeight: elements.canvas.height
                });

                // Canvas'ı temizle
                elements.ctx.clearRect(0, 0, cssWidth, cssHeight);

                // Resmi çiz
                elements.ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

                // Canvas state'ini kaydet
                saveCanvasState();

                // Form verilerini geri yükle
                if (elements.drawingTitleInput && data.title) {
                    elements.drawingTitleInput.value = data.title;
                    console.log('Title restored:', data.title);
                }
                if (elements.drawingTagsInput && data.tags) {
                    elements.drawingTagsInput.value = data.tags;
                    console.log('Tags restored:', data.tags);
                }

                console.log('✅ Guest drawing restored successfully!');

                // Kullanıcıya toast göster
                if (currentUser) {
                    showNotification('Your previous drawing has been restored!', 'success');
                }

                // Restore işleminin başarılı olduğunu test et
                setTimeout(() => {
                    const testImageData = elements.ctx.getImageData(0, 0,
                        elements.canvas.width / (window.devicePixelRatio || 1),
                        elements.canvas.height / (window.devicePixelRatio || 1));
                    let hasPixels = false;
                    for (let i = 3; i < testImageData.data.length; i += 4) {
                        if (testImageData.data[i] > 0) {
                            hasPixels = true;
                            break;
                        }
                    }
                    console.log('Canvas has pixels after restore:', hasPixels);

                    if (!hasPixels) {
                        console.error('❌ Canvas appears empty after restore attempt');
                        // Bir kez daha deneme
                        if (retryCount < maxRetries) {
                            setTimeout(attemptRestore, 100);
                        }
                    }
                }, 200);

            } catch (error) {
                console.error('Error in image onload:', error);
                if (retryCount < maxRetries) {
                    setTimeout(attemptRestore, 100);
                }
            }
        };

        img.onerror = (error) => {
            console.error('Failed to load guest drawing image:', error);
            console.log('Image src preview:', data.imageData.substring(0, 100) + '...');
            // Hatalı veriyi temizle
            localStorage.removeItem('guestDrawing');
        };

        console.log('Setting image src...');
        img.src = data.imageData;
    };

    attemptRestore();
}

function setCanvasSize() {
    if (!elements.canvas || !elements.horseImage || !elements.ctx) return;
    const container = elements.canvas.parentElement;
    if (!container) return;

    let currentContent = null;
    // Mevcut canvas içeriğini kaydet
    if (elements.canvas.width > 0 && elements.canvas.height > 0) {
        try {
            currentContent = elements.canvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.log('Could not save current canvas content:', error);
        }
    }

    const dpr = window.devicePixelRatio || 1;

    // At resminin boyutunu al
    const rect = elements.horseImage.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    console.log('Setting canvas size:', {
        cssWidth,
        cssHeight,
        dpr,
        physicalWidth: cssWidth * dpr,
        physicalHeight: cssHeight * dpr
    });

    // Canvas'ın fiziksel boyutunu ayarla
    elements.canvas.width = cssWidth * dpr;
    elements.canvas.height = cssHeight * dpr;

    // Canvas'ın CSS boyutunu ayarla
    elements.canvas.style.width = `${cssWidth}px`;
    elements.canvas.style.height = `${cssHeight}px`;

    // Context'i ölçekle
    elements.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Canvas özelliklerini tekrar ayarla
    elements.ctx.lineCap = 'round';
    elements.ctx.lineJoin = 'round';
    elements.ctx.strokeStyle = currentColor;
    elements.ctx.lineWidth = currentBrushSize;

    // İçeriği geri yükle
    if (currentContent && currentContent !== 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==') {
        const img = new Image();
        img.onload = () => {
            elements.ctx.clearRect(0, 0, cssWidth, cssHeight);
            elements.ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
        };
        img.src = currentContent;
    }
}



function updateBrushPreview() {
    if (!elements.brushPreview || !elements.brushSize) return;
    const size = parseInt(elements.brushSize.value || currentBrushSize); // `currentBrushSize` yerine slider'ın güncel değerini alalım

    // Sadece fırça boyutu güncellenmiş mi kontrol edelim
    if (size !== currentBrushSize) {
        currentBrushSize = size; // Slider değeri ile JS değişkenini senkronize edelim
    }

    if (isFilling) {
        elements.brushPreview.style.width = '30px'; // Fixed size for fill preview
        elements.brushPreview.style.height = '30px';
        elements.brushPreview.style.backgroundColor = currentColor;
        elements.brushPreview.style.border = `2px solid ${currentColor === '#FFFFFF' || currentColor === '#ffffff' ? '#AAAAAA' : '#9945FF'}`;
        elements.brushPreview.style.borderRadius = '4px'; // Square for fill
    } else if (isErasing) {
        elements.brushPreview.style.width = `${size}px`;
        elements.brushPreview.style.height = `${size}px`;
        elements.brushPreview.style.backgroundColor = 'rgba(128, 128, 128, 0.7)';
        elements.brushPreview.style.border = '2px dashed #FF6B6B';
        elements.brushPreview.style.borderRadius = '50%';
    } else if (isPenActive) { // Pen mode
        elements.brushPreview.style.width = `${size}px`;
        elements.brushPreview.style.height = `${size}px`;
        elements.brushPreview.style.backgroundColor = currentColor;
        elements.brushPreview.style.border = `2px solid ${currentColor === '#FFFFFF' || currentColor === '#ffffff' ? '#AAAAAA' : '#9945FF'}`;
        elements.brushPreview.style.borderRadius = '50%';
    } else { // Varsayılan durum, eğer hiçbir şey aktif değilse
        elements.brushPreview.style.width = '0px';
        elements.brushPreview.style.height = '0px';
        elements.brushPreview.style.border = 'none';
    }

    // Canvas context'inin strokeStyle ve lineWidth ayarlarını da güncellemeliyiz
    if (elements.ctx) {
        elements.ctx.lineWidth = currentBrushSize;
        elements.ctx.strokeStyle = isErasing ? 'rgba(0,0,0,1)' : currentColor;
    }
}


function startDrawing(e) {
    // Sadece isPenActive modu veya isErasing aktifse çizime başla
    if (!elements.ctx || (!isPenActive && !isErasing)) return; // Sadece fırça veya silgi aktifse çizim başlar
    // e.preventDefault(); // This line was removed based on user's check instruction that it should not be here.
    drawing = true;
    const coords = getCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;
    elements.ctx.beginPath();
    elements.ctx.moveTo(lastX, lastY);
}

function draw(e) {
    // Sadece isPenActive modu veya isErasing aktifse çizim yap
    if (!elements.ctx || !drawing || (!isPenActive && !isErasing)) return; // Sadece fırça veya silgi aktifse çizim yapar
    // e.preventDefault(); // This line was removed as it was part of the logic moved to the event listener itself.
    const coords = getCoordinates(e);
    elements.ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
    elements.ctx.strokeStyle = isErasing ? 'rgba(0,0,0,1)' : currentColor;
    elements.ctx.lineWidth = currentBrushSize;
    elements.ctx.lineTo(coords.x, coords.y);
    elements.ctx.stroke();
    lastX = coords.x;
    lastY = coords.y;
}

function stopDrawing(e) {
    if (!drawing) return; // Only stop if pen tool was active
    // e.preventDefault(); // This was not present originally and not requested to be added here.
    if (elements.ctx) elements.ctx.closePath();
    drawing = false;
    saveCanvasState();
}

function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
        if (isFilling) {
            const logicalCoords = getCoordinates(e.touches[0]);
            const dpr = window.devicePixelRatio || 1;
            const physicalX = Math.floor(logicalCoords.x * dpr);
            const physicalY = Math.floor(logicalCoords.y * dpr);
            floodFill(physicalX, physicalY, elements.ctx);
            saveCanvasState();
        } else {
            startDrawing(e.touches[0]);
        }
    }
}
function handleTouchMove(e) { e.preventDefault(); if (e.touches.length === 1 && !isFilling) draw(e.touches[0]); }
function handleTouchEnd(e) { e.preventDefault(); if (!isFilling) stopDrawing(e); }

function getCoordinates(event) {
    if (!elements.canvas) return { x: 0, y: 0 };
    const rect = elements.canvas.getBoundingClientRect();
    // ClientX/Y are CSS pixels. The canvas context is scaled by DPR.
    // We need to return coordinates in the logical space of the canvas.
    return {
        x: (event.clientX - rect.left),
        y: (event.clientY - rect.top)
    };
}

function saveCanvasState() {
    if (!elements.canvas) return;
    undoHistory.push(elements.canvas.toDataURL('image/png', 0.3));
    if (undoHistory.length > 5) undoHistory.shift(); // Geçmişi sınırlamak için
    redoHistory = []; // Yeni bir çizim yapıldığında ileri alma geçmişini temizle
}

function undoLastAction() {
    if (!elements.ctx || !elements.canvas || undoHistory.length <= 1) return;

    // Mevcut durumu redo geçmişine eklemeden önce son durumu çek
    const currentState = undoHistory.pop();
    redoHistory.push(currentState); // Geri alınan durumu ileri alma geçmişine ekle

    const lastStateDataUrl = undoHistory[undoHistory.length - 1];
    const img = new Image();
    const dpr = window.devicePixelRatio || 1;
    img.onload = () => {
        elements.ctx.clearRect(0, 0, elements.canvas.width / dpr, elements.canvas.height / dpr);
        elements.ctx.drawImage(img, 0, 0, elements.canvas.width / dpr, elements.canvas.height / dpr);
    };
    img.src = lastStateDataUrl;
}

function redoLastAction() {
    if (!elements.ctx || !elements.canvas || redoHistory.length === 0) return;

    const nextStateDataUrl = redoHistory.pop(); // Redo geçmişinden son durumu al
    undoHistory.push(nextStateDataUrl); // Bu durumu geri alma geçmişine ekle (ileriye gittiğimiz için)

    const img = new Image();
    const dpr = window.devicePixelRatio || 1;
    img.onload = () => {
        elements.ctx.clearRect(0, 0, elements.canvas.width / dpr, elements.canvas.height / dpr);
        elements.ctx.drawImage(img, 0, 0, elements.canvas.width / dpr, elements.canvas.height / dpr);
    };
    img.src = nextStateDataUrl;
}

function clearCanvas() {
    if (!elements.ctx || !elements.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    elements.ctx.clearRect(0, 0, elements.canvas.width / dpr, elements.canvas.height / dpr);
    saveCanvasState();

    // Guest kullanıcı için drawing'i de temizle
    if (!currentUser) {
        localStorage.removeItem('guestDrawing');
        console.log('Canvas cleared, guest drawing removed from storage');
    }
}


function combineCanvasWithHorse() {
    if (!elements.canvas || !elements.horseImage) return null;

    const tempCanvas = document.createElement('canvas');
    const originalHorseImg = elements.horseImage;

    // Resmin orijinal boyutlarını al
    const targetWidth = originalHorseImg.naturalWidth || 600;
    const targetHeight = originalHorseImg.naturalHeight || 400;

    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Beyaz arka plan çiz
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, targetWidth, targetHeight);

    // At resmini çiz
    tempCtx.drawImage(originalHorseImg, 0, 0, targetWidth, targetHeight);

    // Kullanıcının çizdiği kısmı üstüne çiz (Canvas boyutlarını tempCanvas boyutlarına ölçekle)
    tempCtx.drawImage(
        elements.canvas,
        0, 0, elements.canvas.width, elements.canvas.height, // Source canvas (fiziksel pikseller)
        0, 0, targetWidth, targetHeight                     // Hedef canvas (mantıksal pikseller)
    );

    // Kaliteyi 1.0 (en yüksek) olarak ayarla, sıkıştırmayı backend halledecek
    return tempCanvas.toDataURL('image/png', 1.0); // Kalite 0.2'den 1.0'a yükseltildi
}


// Helper function to compare two RGBA color arrays
function colorsAreEqual(color1, color2, tolerance = 0) {
    if (!color1 || !color2) return false;
    if (tolerance === 0) {
        return color1[0] === color2[0] &&
            color1[1] === color2[1] &&
            color1[2] === color2[2] &&
            color1[3] === color2[3];
    }
    return Math.abs(color1[0] - color2[0]) <= tolerance &&
        Math.abs(color1[1] - color2[1]) <= tolerance &&
        Math.abs(color1[2] - color2[2]) <= tolerance &&
        Math.abs(color1[3] - color2[3]) <= tolerance;
}

// Flood Fill Implementation
function floodFill(startX, startY, ctx) {
    const canvas = ctx.canvas;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const canvasWidth = imageData.width;
    const canvasHeight = imageData.height;

    function getPixelColor(x, y) {
        if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) {
            return null; // Out of bounds
        }
        const index = (y * canvasWidth + x) * 4;
        return [data[index], data[index + 1], data[index + 2], data[index + 3]];
    }

    function setPixelColor(x, y, color) {
        const index = (y * canvasWidth + x) * 4;
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
        data[index + 3] = color[3];
    }

    const targetColor = getPixelColor(startX, startY);
    if (!targetColor) return; // Clicked out of bounds

    const r = parseInt(currentColor.slice(1, 3), 16);
    const g = parseInt(currentColor.slice(3, 5), 16);
    const b = parseInt(currentColor.slice(5, 7), 16);
    const fillColor = [r, g, b, 255]; // Opaque fill

    if (colorsAreEqual(targetColor, fillColor)) {
        return; // No need to fill if target is already the fill color
    }

    const queue = [[startX, startY]];
    const visited = new Set(); // To keep track of visited pixels and avoid re-processing

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        const pixelKey = `${x},${y}`;

        if (visited.has(pixelKey)) {
            continue;
        }
        visited.add(pixelKey);

        const currentPixelColor = getPixelColor(x, y);

        if (currentPixelColor && colorsAreEqual(currentPixelColor, targetColor, 10)) { // Added tolerance for anti-aliasing
            setPixelColor(x, y, fillColor);

            if (x + 1 < canvasWidth) queue.push([x + 1, y]);
            if (x - 1 >= 0) queue.push([x - 1, y]);
            if (y + 1 < canvasHeight) queue.push([x, y + 1]);
            if (y - 1 >= 0) queue.push([x, y - 1]);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}


/**
 * Gallery Loading Functions
 */
async function loadDrawings(filter = 'latest', searchQuery = '') {
    if (!elements.gallery) return;
    elements.gallery.innerHTML = `<div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i><span>Loading drawings...</span></div>`;

    try {
        // Build URL with pagination parameters - backend now handles pagination
        const params = new URLSearchParams({
            page: currentPage,
            limit: ITEMS_PER_PAGE,
            filter: filter
        });
        if (searchQuery) {
            params.append('search', searchQuery);
        }

        const response = await fetch(`${API_BASE_URL}/drawings?${params}`);
        if (!response.ok) {
            let errorMsg = `Failed to fetch drawings: ${response.status}`;
            try { const errData = await response.json(); if (errData.message) errorMsg = errData.message; } catch (e) { }
            throw new Error(errorMsg);
        }
        const data = await response.json();

        // Handle new paginated response format
        const drawings = data.drawings || data;
        const pagination = data.pagination;

        if (!drawings || drawings.length === 0) {
            elements.gallery.innerHTML = '<div class="no-results">No drawings found. Be the first to publish!</div>';
            updatePaginationUI(0, 0);
            return;
        }

        // Update pagination from server response
        if (pagination) {
            totalPages = pagination.totalPages;
        }

        renderDrawings(drawings);
        updatePaginationUI(pagination?.totalCount || drawings.length, totalPages);

    } catch (error) {
        elements.gallery.innerHTML = `<div class="error-message">Error loading drawings: ${error.message}. Please try again.</div>`;
        updatePaginationUI(0, 0);
    }
}

function renderDrawings(drawingsToRender) {
    if (!elements.gallery) return;
    elements.gallery.innerHTML = '';

    if (drawingsToRender.length === 0) {
        elements.gallery.innerHTML = '<div class="no-results" style="text-align:center; padding: 20px; color:#aaa;">No drawings match your criteria.</div>';
        return;
    }

    drawingsToRender.forEach(drawingItem => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.setAttribute('aria-label', `Drawing titled ${drawingItem.title || 'Untitled'} by ${drawingItem.creatorUsername || 'Unknown'}`);
        galleryItem.tabIndex = 0; // Klavye erişilebilirliği için

        // Bu kısım GÜNCELLENDİ
        const hasLiked = currentUser && drawingItem.likes && drawingItem.likes.some(like => (typeof like === 'string' && like === currentUser._id) || (typeof like === 'object' && like._id === currentUser._id));
        const likeButtonClass = `gallery-like-btn ${hasLiked ? 'liked' : ''}`;
        const likeButtonIcon = hasLiked ? 'fas fa-heart' : 'far fa-heart'; // Dolu kalp veya boş kalp

        galleryItem.innerHTML = `
            <img src="${drawingItem.image}" alt="${drawingItem.title || 'Untitled'}" loading="lazy">
            <div class="gallery-info">
                <h3 class="gallery-title">${drawingItem.title || 'Untitled'}</h3>
                <p class="gallery-creator">by ${drawingItem.creatorUsername || 'Unknown'}</p>
                <div class="gallery-stats">
                    <button class="${likeButtonClass}" data-drawing-id="${drawingItem._id}" data-current-user-id="${currentUser ? currentUser._id : ''}">
                        <i class="${likeButtonIcon}" aria-hidden="true"></i> <span class="like-count">${drawingItem.likes?.length || 0}</span>
                    </button>
                    <span class="stat comment-stat">
                        <i class="fas fa-comments" aria-hidden="true"></i> ${drawingItem.comments?.length || 0}
                    </span>
                </div>
            </div>
        `;

        // Ana galeri öğesinin tıklama olayı (çizimi açmak için)
        const openGalleryItem = () => window.location.hash = `#drawing=${drawingItem._id}`;
        galleryItem.addEventListener('click', (e) => {
            // Eğer beğenme butonuna tıklanmadıysa, çizim detayını aç
            if (!e.target.closest('.gallery-like-btn')) {
                openGalleryItem();
            }
        });
        galleryItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (!e.target.closest('.gallery-like-btn')) {
                    openGalleryItem();
                }
            }
        });

        // Beğenme butonu için tıklama olayı
        const likeButton = galleryItem.querySelector('.gallery-like-btn');
        if (likeButton) {
            likeButton.addEventListener('click', async (e) => {
                e.stopPropagation(); // Olayın parent (galeri öğesi) elementine yayılmasını engelle
                const drawingId = likeButton.dataset.drawingId;

                // Geçici olarak currentUser'ı ve currentDrawing'i ayarlayalım
                // Normalde openDrawingViewModal'daki gibi global currentDrawing'i güncel tutarız
                // Ancak hızlı beğenme için sadece ID yeterli
                if (!window.getCurrentUser()) {
                    window.showNotification('Login to like drawings.', 'info');
                    return;
                }

                try {
                    // Backend'e beğeni isteği gönder
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(`${API_BASE_URL}/drawings/${drawingId}/like`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (response.ok) {
                        const updatedDrawing = await response.json();
                        // Butonun UI'ını güncelle
                        const newLikesCount = updatedDrawing.likes?.length || 0;
                        likeButton.querySelector('.like-count').textContent = newLikesCount;

                        const currentUserLiked = updatedDrawing.likes.some(like => (typeof like === 'string' && like === window.getCurrentUser()._id) || (typeof like === 'object' && like._id === window.getCurrentUser()._id));

                        likeButton.classList.toggle('liked', currentUserLiked);
                        likeButton.querySelector('i').className = currentUserLiked ? 'fas fa-heart' : 'far fa-heart';

                    } else {
                        const errorData = await response.json();
                        window.showNotification(errorData.message || 'Failed to like drawing.', 'error');
                    }
                } catch (error) {
                    window.showNotification('Error liking drawing. Please try again.', 'error');
                }
            });
        }
        elements.gallery.appendChild(galleryItem);
    });
}

function updatePaginationUI(totalItems, calculatedTotalPages) {
    if (!elements.pageInfo || !elements.prevPageBtn || !elements.nextPageBtn) return;

    totalPages = calculatedTotalPages;

    if (totalItems > 0) {
        elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    } else {
        elements.pageInfo.textContent = 'No results';
    }
    elements.prevPageBtn.disabled = currentPage <= 1;
    elements.nextPageBtn.disabled = currentPage >= totalPages;
}


async function loadRecentDrawings() {
    if (!elements.recentDrawingsContainer) return;
    elements.recentDrawingsContainer.innerHTML = `<div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i><span>Loading recent drawings...</span></div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/drawings?limit=4&page=1`);
        if (!response.ok) throw new Error(`Failed to fetch recent drawings: ${response.status}`);
        const data = await response.json();

        // Handle new paginated response format
        const recentDrawings = data.drawings || data;

        if (!recentDrawings || recentDrawings.length === 0) {
            elements.recentDrawingsContainer.innerHTML = '<p class="no-results" style="text-align:center; color: #aaa;">No drawings available yet.</p>';
            return;
        }

        elements.recentDrawingsContainer.innerHTML = '';

        recentDrawings.forEach(drawingItem => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            galleryItem.setAttribute('aria-label', `Recent drawing: ${drawingItem.title || 'Untitled'} by ${drawingItem.creatorUsername || 'Unknown'}`);
            galleryItem.tabIndex = 0;

            // Bu kısım GÜNCELLENDİ (renderDrawings ile aynı mantık)
            const hasLiked = currentUser && drawingItem.likes && drawingItem.likes.some(like => (typeof like === 'string' && like === currentUser._id) || (typeof like === 'object' && like._id === currentUser._id));
            const likeButtonClass = `gallery-like-btn ${hasLiked ? 'liked' : ''}`;
            const likeButtonIcon = hasLiked ? 'fas fa-heart' : 'far fa-heart';

            galleryItem.innerHTML = `
                <img src="${drawingItem.image}" alt="${drawingItem.title || 'Untitled'}" loading="lazy">
                <div class="gallery-info">
                    <h3 class="gallery-title">${drawingItem.title || 'Untitled'}</h3>
                    <p class="gallery-creator">by ${drawingItem.creatorUsername || 'Unknown'}</p>
                    <div class="gallery-stats">
                        <button class="${likeButtonClass}" data-drawing-id="${drawingItem._id}" data-current-user-id="${currentUser ? currentUser._id : ''}">
                            <i class="${likeButtonIcon}" aria-hidden="true"></i> <span class="like-count">${drawingItem.likes?.length || 0}</span>
                        </button>
                        <span class="stat comment-stat">
                            <i class="fas fa-comments" aria-hidden="true"></i> ${drawingItem.comments?.length || 0}
                        </span>
                    </div>
                </div>
            `;
            galleryItem.style.cursor = 'pointer';

            const openRecentDrawing = () => window.location.href = `gallery.html#drawing=${drawingItem._id}`;
            galleryItem.addEventListener('click', (e) => {
                if (!e.target.closest('.gallery-like-btn')) {
                    openRecentDrawing();
                }
            });
            galleryItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (!e.target.closest('.gallery-like-btn')) {
                        openRecentDrawing();
                    }
                }
            });

            // Beğenme butonu için tıklama olayı (renderDrawings ile aynı mantık)
            const likeButton = galleryItem.querySelector('.gallery-like-btn');
            if (likeButton) {
                likeButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const drawingId = likeButton.dataset.drawingId;

                    if (!window.getCurrentUser()) {
                        window.showNotification('Login to like drawings.', 'info');
                        return;
                    }

                    try {
                        const token = localStorage.getItem('authToken');
                        const response = await fetch(`${API_BASE_URL}/drawings/${drawingId}/like`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (response.ok) {
                            const updatedDrawing = await response.json();
                            const newLikesCount = updatedDrawing.likes?.length || 0;
                            likeButton.querySelector('.like-count').textContent = newLikesCount;

                            const currentUserLiked = updatedDrawing.likes.some(like => (typeof like === 'string' && like === window.getCurrentUser()._id) || (typeof like === 'object' && like._id === window.getCurrentUser()._id));

                            likeButton.classList.toggle('liked', currentUserLiked);
                            likeButton.querySelector('i').className = currentUserLiked ? 'fas fa-heart' : 'far fa-heart';

                        } else {
                            const errorData = await response.json();
                            window.showNotification(errorData.message || 'Failed to like drawing.', 'error');
                        }
                    } catch (error) {
                        window.showNotification('Error liking drawing. Please try again.', 'error');
                    }
                });
            }
            elements.recentDrawingsContainer.appendChild(galleryItem);
        });
    } catch (error) {
        elements.recentDrawingsContainer.innerHTML = `<p class="error-message" style="text-align:center; color: #ff6b6b;">Failed to load recent drawings. ${error.message}</p>`;
    }
}


/**
 * Drawing View Functions
 */
function openDrawingView(drawingItem) {
    if (!elements.viewDrawingModal || !elements.viewDrawingImage || !elements.viewDrawingTitle || !elements.viewDrawingCreator || !elements.creatorAvatar) {
        return;
    }

    currentDrawing = drawingItem;

    elements.viewDrawingImage.src = drawingItem.image;
    elements.viewDrawingTitle.textContent = drawingItem.title || 'Untitled';
    elements.viewDrawingCreator.textContent = `by ${drawingItem.creatorUsername || 'Unknown'}`;
    elements.creatorAvatar.src = drawingItem.creatorAvatar || 'assets/default-avatar.png';

    if (elements.drawingDate) elements.drawingDate.textContent = drawingItem.createdAt ? getRelativeTime(drawingItem.createdAt) : 'N/A';
    if (elements.drawingModalTags) elements.drawingModalTags.textContent = drawingItem.tags?.join(', ') || 'No tags';

    elements.viewDrawingModal.style.display = 'flex';
    updateLikesAndComments();
    updateUIForAuthState();
}

function updateLikesAndComments() {
    if (!currentDrawing || !elements.likeCount || !elements.commentsList || !elements.likeDrawingBtn) {
        return;
    }

    const likes = Array.isArray(currentDrawing.likes) ? currentDrawing.likes : [];
    elements.likeCount.textContent = likes.length;

    const hasLiked = currentUser && likes.some(like => (typeof like === 'string' && like === currentUser._id) || (typeof like === 'object' && like._id === currentUser._id));
    elements.likeDrawingBtn.classList.toggle('liked', hasLiked);
    const heartIcon = elements.likeDrawingBtn.querySelector('i');
    if (heartIcon) {
        heartIcon.className = hasLiked ? 'fas fa-heart' : 'far fa-heart';
    }
    renderComments(currentDrawing.comments || []);
}

function renderComments(comments) {
    if (!elements.commentsList) return;
    elements.commentsList.innerHTML = '';
    if (!comments || comments.length === 0) {
        elements.commentsList.innerHTML = '<div class="no-comments">No comments yet.</div>';
        return;
    }

    comments.forEach(comment => {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment';
        commentEl.innerHTML = `
            <div class="comment-header">
                <div class="comment-user">
                    <img src="${comment.userAvatar || 'assets/default-avatar.png'}" alt="${comment.username}" class="comment-avatar">
                    <span class="comment-username">${comment.username}</span>
                </div>
                <span class="comment-date">${getRelativeTime(comment.createdAt)}</span>
            </div>
            <p class="comment-text">${comment.text}</p>
        `;
        elements.commentsList.appendChild(commentEl);
    });
}

async function likeDrawing() {
    if (!currentUser || !currentDrawing) return;
    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_BASE_URL}/drawings/${currentDrawing._id}/like`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            currentDrawing = await response.json();
            updateLikesAndComments();
        } else {
            const errorData = await response.json();
            showNotification(errorData.message || 'Failed to like drawing.', 'error');
        }
    } catch (error) {
        showNotification('Error liking drawing. Please try again.', 'error');
    }
}

async function submitComment() {
    if (!currentUser || !currentDrawing || !elements.commentInput) return;
    const text = elements.commentInput.value.trim();
    if (!text) return;

    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_BASE_URL}/drawings/${currentDrawing._id}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text })
        });
        if (response.ok) {
            currentDrawing = await response.json();
            updateLikesAndComments();
            elements.commentInput.value = '';
            if (elements.emojiList) elements.emojiList.classList.remove('active');
        } else {
            const errorData = await response.json();
            showNotification(errorData.message || 'Failed to submit comment.', 'error');
        }
    } catch (error) {
        showNotification('Error submitting comment. Please try again.', 'error');
    }
}

/**
 * Share & Report Modal Functions
 */
function openShareModal() {
    if (!currentDrawing || !elements.shareModal || !elements.shareLink) return;
    const drawingUrl = `${window.location.origin}${window.location.pathname}#drawing=${currentDrawing._id}`;
    elements.shareLink.value = drawingUrl;
    elements.shareModal.style.display = 'flex';
}

function openReportModal() {
    if (!currentDrawing || !elements.reportModal) return;
    elements.reportForm.reset(); // Reset previous report form
    elements.reportModal.style.display = 'flex';
}

/**
 * Drawing Publish Function
 */
async function handlePublishDrawing() {
    if (!currentUser || !elements.canvas || !elements.drawingTitleInput || !elements.drawingTagsInput || !elements.confirmPublishBtn) return;
    if (currentUser.hasPublished && !currentUser.isAdmin) {
        showNotification("You've already published a drawing for this competition!", "error");
        return;
    }

    elements.confirmPublishBtn.disabled = true;
    elements.confirmPublishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';

    const title = elements.drawingTitleInput.value.trim() || 'Untitled';
    const tags = elements.drawingTagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const combinedImage = combineCanvasWithHorse();

    if (!combinedImage) {
        showNotification('Error combining image. Please try again.', 'error');
        elements.confirmPublishBtn.disabled = false;
        elements.confirmPublishBtn.innerHTML = 'Publish!';
        return;
    }

    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_BASE_URL}/drawings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ image: combinedImage, title, tags })
        });

        if (response.ok) {
            const newDrawing = await response.json();
            showNotification('Drawing published successfully!', 'success');
            closeModal(elements.publishModal);

            // Guest çizimi temizle - artık published olduktan sonra
            localStorage.removeItem('guestDrawing');
            console.log('Guest drawing cleared after successful publish');

            // User state'i güncelle
            currentUser.hasPublished = true;

            // Published çizimi canvas'ta göster
            showUserPublishedDrawing(newDrawing);

            // Publish butonunu devre dışı bırak
            if (elements.publishBtn && !currentUser.isAdmin) {
                elements.publishBtn.disabled = true;
                elements.publishBtn.style.opacity = '0.5';
                elements.publishBtn.style.cursor = 'not-allowed';
                elements.publishBtn.title = 'You have already published one drawing for this week\'s competition.';
                updateUIForAuthState();
            }

            // Recent drawings'i güncelle
            if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                loadRecentDrawings();
            }
        } else {
            const errorData = await response.json();
            showNotification(errorData.message || 'Failed to publish drawing.', 'error');
        }
    } catch (error) {
        showNotification('Error publishing drawing. Please try again.', 'error');
    } finally {
        elements.confirmPublishBtn.disabled = false;
        elements.confirmPublishBtn.innerHTML = 'Publish!';
    }
}

function clearDrawingFromStorage() {
    localStorage.removeItem('guestDrawing');
    console.log('Guest drawing cleared from localStorage');
}

/**
 * Emoji Picker Setup
 */
function setupEmojiPicker() {
    if (!elements.emojiList || !elements.emojiPickerBtn || !elements.commentInput) return;
    POPULAR_EMOJIS.forEach(emoji => {
        const emojiEl = document.createElement('span');
        emojiEl.className = 'emoji-item';
        emojiEl.textContent = emoji;
        emojiEl.addEventListener('click', () => {
            elements.commentInput.value += emoji;
            elements.emojiList.classList.remove('active');
        });
        elements.emojiList.appendChild(emojiEl);
    });

    elements.emojiPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.emojiList.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (elements.emojiList && elements.emojiList.classList.contains('active') && !elements.emojiList.contains(e.target) && e.target !== elements.emojiPickerBtn) {
            elements.emojiList.classList.remove('active');
        }
    });
}

/**
 * Competition Countdown Timer and Banner
 */
function initializeCompetitionElements() {
    const competitionEndDateStr = COMPETITION_END_DATE.toISOString();
    if (elements.competitionEndDateEl) {
        elements.competitionEndDateEl.textContent = COMPETITION_END_DATE.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + " at " + COMPETITION_END_DATE.toLocaleTimeString();
    }

    // Common countdown update logic for all relevant elements
    const countdownElements = [
        elements.competitionCountdownTimerEl,
        elements.competitionLeaderboardCountdownEl,
        elements.rulesPageCountdownTimerEl
    ];

    countdownElements.forEach(el => {
        if (el) updateCompetitionCountdown(el, competitionEndDateStr);
    });

    setInterval(() => {
        countdownElements.forEach(el => {
            if (el) updateCompetitionCountdown(el, competitionEndDateStr);
        });
    }, 1000);

    // Collapsible Banner Logic
    if (elements.bannerHeaderClickable && elements.competitionBannerCollapsible && elements.bannerDetailsCollapsible) {
        const toggleBanner = () => {
            const isOpen = elements.competitionBannerCollapsible.classList.toggle('open');
            elements.bannerHeaderClickable.setAttribute('aria-expanded', isOpen.toString());
            elements.bannerDetailsCollapsible.style.maxHeight = isOpen ? elements.bannerDetailsCollapsible.scrollHeight + "px" : "0";
        };
        elements.bannerHeaderClickable.addEventListener('click', toggleBanner);
        elements.bannerHeaderClickable.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleBanner();
            }
        });
    }
}

async function testAvatarEndpoint() {
    try {
        const response = await fetch(`${API_BASE_URL}/test/avatar`);
        const data = await response.json();
        console.log('Avatar test result:', data);
    } catch (error) {
        console.error('Avatar test failed:', error);
    }
}

function updateCompetitionCountdown(element, endDateStr) {
    const now = new Date().getTime();
    const endTime = new Date(endDateStr).getTime();
    const distance = endTime - now;

    if (distance < 0) {
        element.innerHTML = "Competition Ended!";
        return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    element.innerHTML = `Ends in: ${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Notification System
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(notification);

    // Trigger reflow to enable animation
    notification.offsetHeight;
    notification.classList.add('active');

    setTimeout(() => {
        notification.classList.remove('active'); // Start fade out
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300); // Match CSS fadeOut duration
    }, 2700); // Total display time before fadeOut starts
}


/**
 * Admin Panel Functions
 */
async function initializeAdminPanel() {
    if (!elements.adminPanelContainer) return;
    if (!currentUser || !currentUser.isAdmin) {
        showNotification("Access Denied: Admin privileges required.", "error");
        elements.adminPanelContainer.innerHTML = "<p style='color:red; text-align:center;'>Access Denied. You are not an administrator.</p>";
        // Redirect or disable further admin actions if on admin page without rights
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    await loadAdminUsers();
    await loadAdminDrawings();
}

async function loadAdminUsers() {
    if (!elements.adminUsersTableBody) return;
    elements.adminUsersTableBody.innerHTML = '<tr><td colspan="7" class="loading-admin-data"><i class="fas fa-spinner fa-spin"></i> Loading users...</td></tr>';
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
        adminUsersCache = await response.json();
        renderAdminUsersTable(adminUsersCache);
    } catch (error) {
        elements.adminUsersTableBody.innerHTML = `<tr><td colspan="7" class="error-message">Error loading users: ${error.message}</td></tr>`;
    }
}

function renderAdminUsersTable(users) {
    if (!elements.adminUsersTableBody) return;
    elements.adminUsersTableBody.innerHTML = '';
    if (!users || users.length === 0) {
        elements.adminUsersTableBody.innerHTML = '<tr><td colspan="7" class="no-results-admin">No users found.</td></tr>';
        return;
    }
    users.forEach(user => {
        const row = elements.adminUsersTableBody.insertRow();
        row.innerHTML = `
            <td><img src="${user.avatar || 'assets/default-avatar.png'}" alt="${user.username}" class="admin-avatar-img"></td>
            <td data-label="Username">${user.username}</td>
            <td data-label="Email">${user.email}</td>
            <td data-label="Admin?">
                <i class="fas ${user.isAdmin ? 'fa-user-shield admin' : 'fa-user not-admin'} action-icon toggle-admin-icon" 
                   title="${user.isAdmin ? 'Revoke Admin' : 'Make Admin'}" 
                   data-user-id="${user._id}" data-username="${user.username}" data-is-admin="${user.isAdmin}"
                   aria-label="${user.isAdmin ? 'Revoke Admin Privileges' : 'Grant Admin Privileges'}"
                   tabindex="0" role="button"></i>
            </td>
            <td data-label="Published?">${user.hasPublished ? '<i class="fas fa-check-circle" style="color: #14F195;"></i> Yes' : '<i class="fas fa-times-circle" style="color: #FF6B6B;"></i> No'}</td>
            <td data-label="Joined">${new Date(user.createdAt).toLocaleDateString()}</td>
            <td data-label="Actions">
                <i class="fas fa-trash-alt action-icon delete-icon" title="Delete User" 
                   data-user-id="${user._id}" data-username="${user.username}"
                   aria-label="Delete User" tabindex="0" role="button"></i>
            </td>
        `;
    });
}


async function loadAdminDrawings() {
    if (!elements.adminDrawingsTableBody) return;
    elements.adminDrawingsTableBody.innerHTML = '<tr><td colspan="7" class="loading-admin-data"><i class="fas fa-spinner fa-spin"></i> Loading drawings...</td></tr>';
    try {
        const token = localStorage.getItem('authToken');
        // Using the public drawings endpoint for now, an admin-specific one could be made if needed
        const response = await fetch(`${API_BASE_URL}/drawings`, {
            headers: { 'Authorization': `Bearer ${token}` } // Token might not be needed for public endpoint but good practice for admin context
        });
        if (!response.ok) throw new Error(`Failed to fetch drawings: ${response.status}`);
        adminDrawingsCache = await response.json();
        adminDrawingsCache.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by recent
        renderAdminDrawingsTable(adminDrawingsCache);
    } catch (error) {
        elements.adminDrawingsTableBody.innerHTML = `<tr><td colspan="7" class="error-message">Error loading drawings: ${error.message}</td></tr>`;
    }
}

// Çizimi localStorage'a kaydet
function saveDrawingToStorage() {
    if (!currentUser && elements.canvas && elements.ctx) {
        try {
            console.log('Attempting to save guest drawing...');

            // Canvas boyutlarını kontrol et
            const cssWidth = elements.canvas.clientWidth;
            const cssHeight = elements.canvas.clientHeight;

            console.log('Canvas save dimensions:', {
                cssWidth,
                cssHeight,
                canvasWidth: elements.canvas.width,
                canvasHeight: elements.canvas.height
            });

            if (cssWidth === 0 || cssHeight === 0) {
                console.log('Canvas dimensions are 0, skipping save');
                return;
            }

            // Canvas'ın boş olup olmadığını kontrol et
            const dpr = window.devicePixelRatio || 1;
            const imageData = elements.ctx.getImageData(0, 0,
                elements.canvas.width, elements.canvas.height);
            let isEmpty = true;
            let pixelCount = 0;

            // Piksel verilerini kontrol et
            for (let i = 3; i < imageData.data.length; i += 4) {
                if (imageData.data[i] > 0) { // Alpha channel > 0
                    isEmpty = false;
                    pixelCount++;
                }
            }

            console.log('Canvas analysis:', {
                isEmpty,
                pixelCount,
                totalPixels: imageData.data.length / 4
            });

            if (!isEmpty) {
                const drawingData = {
                    imageData: elements.canvas.toDataURL('image/png', 1.0), // En yüksek kalite
                    title: elements.drawingTitleInput?.value || '',
                    tags: elements.drawingTagsInput?.value || '',
                    timestamp: Date.now(),
                    canvasWidth: cssWidth,
                    canvasHeight: cssHeight
                };

                localStorage.setItem('guestDrawing', JSON.stringify(drawingData));
                console.log('✅ Guest drawing saved to localStorage', {
                    imageDataLength: drawingData.imageData.length,
                    title: drawingData.title,
                    tags: drawingData.tags,
                    canvasWidth: drawingData.canvasWidth,
                    canvasHeight: drawingData.canvasHeight
                });
            } else {
                console.log('Canvas is empty, not saving');
            }
        } catch (error) {
            console.error('Error saving guest drawing:', error);
        }
    }
}

// Sayfa yüklendiğinde çizimi geri yükle
function loadDrawingFromStorage() {
    const savedDrawing = localStorage.getItem('guestDrawing');
    if (savedDrawing) {
        try {
            const data = JSON.parse(savedDrawing);
            console.log('Guest drawing data found:', {
                hasImageData: !!data.imageData,
                imageDataLength: data.imageData ? data.imageData.length : 0,
                title: data.title,
                tags: data.tags,
                timestamp: new Date(data.timestamp).toLocaleString()
            });

            if (data.imageData) {
                console.log('Attempting to restore guest drawing...');

                // Canvas hazır olana kadar bekle - daha aggressive retry
                let retryCount = 0;
                const maxRetries = 50; // 5 saniye

                const attemptRestore = () => {
                    retryCount++;
                    // console.log(`Restore attempt ${retryCount}/${maxRetries}`);

                    if (!elements.canvas || !elements.ctx) {
                        console.log('Canvas not ready, elements check:', {
                            hasCanvas: !!elements.canvas,
                            hasCtx: !!elements.ctx
                        });

                        if (retryCount < maxRetries) {
                            setTimeout(attemptRestore, 100);
                        } else {
                            console.error('Max retries reached, canvas not ready');
                        }
                        return;
                    }

                    // Canvas boyutlarını kontrol et
                    const rect = elements.canvas.getBoundingClientRect();
                    console.log('Canvas dimensions:', {
                        clientWidth: elements.canvas.clientWidth,
                        clientHeight: elements.canvas.clientHeight,
                        canvasWidth: elements.canvas.width,
                        canvasHeight: elements.canvas.height,
                        rectWidth: rect.width,
                        rectHeight: rect.height
                    });

                    if (elements.canvas.clientWidth === 0 || elements.canvas.clientHeight === 0) {
                        console.log('Canvas dimensions are 0, waiting...');
                        if (retryCount < maxRetries) {
                            setTimeout(attemptRestore, 100);
                        }
                        return;
                    }

                    const img = new Image();
                    img.onload = () => {
                        try {
                            console.log('Image loaded successfully, dimensions:', {
                                imgWidth: img.width,
                                imgHeight: img.height,
                                naturalWidth: img.naturalWidth,
                                naturalHeight: img.naturalHeight
                            });

                            // Canvas boyutlarını tekrar ayarla
                            setCanvasSize();

                            // Canvas temizle
                            const dpr = window.devicePixelRatio || 1;
                            const cssWidth = elements.canvas.clientWidth;
                            const cssHeight = elements.canvas.clientHeight;

                            console.log('Drawing with dimensions:', {
                                cssWidth,
                                cssHeight,
                                dpr,
                                physicalWidth: elements.canvas.width,
                                physicalHeight: elements.canvas.height
                            });

                            // Önce canvas'ı tamamen temizle
                            elements.ctx.clearRect(0, 0, cssWidth, cssHeight);

                            // Resmi çiz
                            elements.ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

                            // Canvas state'ini kaydet
                            saveCanvasState();

                            // Form verilerini geri yükle
                            if (elements.drawingTitleInput && data.title) {
                                elements.drawingTitleInput.value = data.title;
                                console.log('Title restored:', data.title);
                            }
                            if (elements.drawingTagsInput && data.tags) {
                                elements.drawingTagsInput.value = data.tags;
                                console.log('Tags restored:', data.tags);
                            }

                            console.log('✅ Guest drawing restored successfully!');

                            // Kullanıcıya bilgi ver (sadece login sonrası)
                            if (currentUser && typeof showNotification === 'function') {
                                showNotification('Your previous drawing has been restored!', 'success');
                            }

                            // Restore işleminin başarılı olduğunu test et
                            setTimeout(() => {
                                const testImageData = elements.ctx.getImageData(0, 0, cssWidth, cssHeight);
                                let hasPixels = false;
                                for (let i = 3; i < testImageData.data.length; i += 4) {
                                    if (testImageData.data[i] > 0) {
                                        hasPixels = true;
                                        break;
                                    }
                                }
                                console.log('Canvas has pixels after restore:', hasPixels);

                                if (!hasPixels) {
                                    console.error('❌ Canvas appears empty after restore attempt');
                                }
                            }, 100);

                        } catch (error) {
                            console.error('Error in image onload:', error);
                        }
                    };

                    img.onerror = (error) => {
                        console.error('Failed to load guest drawing image:', error);
                        console.log('Image src preview:', data.imageData.substring(0, 100) + '...');
                        // Hatalı veriyi temizle
                        localStorage.removeItem('guestDrawing');
                    };

                    console.log('Setting image src...');
                    img.src = data.imageData;
                };

                attemptRestore();
            } else {
                console.log('No image data in saved drawing');
            }
        } catch (error) {
            console.error('Error parsing guest drawing data:', error);
            localStorage.removeItem('guestDrawing');
        }
    } else {
        console.log('No guest drawing found in localStorage');
    }
}

// Canvas değişikliklerini otomatik kaydet
function setupAutoSave() {
    let saveTimeout;
    const autoSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            // Sadece guest kullanıcılar için kaydet
            if (!currentUser) {
                saveDrawingToStorage();
            }
        }, 2000);
    };

    // Canvas eventlarına ekle
    if (elements.canvas) {
        elements.canvas.addEventListener('mouseup', autoSave);
        elements.canvas.addEventListener('touchend', autoSave);

        // Tool değişikliklerinde de kaydet
        if (elements.brushSize) {
            elements.brushSize.addEventListener('change', autoSave);
        }
        if (elements.colorPicker) {
            elements.colorPicker.addEventListener('change', autoSave);
        }

        // Color button'lara da ekle
        elements.colorButtons.forEach(btn => {
            btn.addEventListener('click', autoSave);
        });
    }
}

function handleWindowResize() {
    if (elements.canvas && (window.location.pathname.includes('index.html') || window.location.pathname === '/')) {
        console.log('Window resized, adjusting canvas...');

        // Mevcut canvas içeriğini kaydet
        let currentContent = null;
        try {
            if (elements.canvas.width > 0 && elements.canvas.height > 0) {
                currentContent = elements.canvas.toDataURL('image/png', 1.0);
            }
        } catch (error) {
            console.log('Could not save content during resize:', error);
        }

        // Canvas boyutunu ayarla
        setCanvasSize();

        // İçeriği geri yükle
        if (currentContent && currentContent !== 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==') {
            const img = new Image();
            img.onload = () => {
                const cssWidth = elements.canvas.clientWidth;
                const cssHeight = elements.canvas.clientHeight;
                elements.ctx.clearRect(0, 0, cssWidth, cssHeight);
                elements.ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

                // Guest için otomatik kaydet
                if (!currentUser) {
                    setTimeout(() => saveDrawingToStorage(), 200);
                }
            };
            img.src = currentContent;
        }
    }
}

async function checkPublishedState() {
    if (currentUser && currentUser.hasPublished && !currentUser.isAdmin) {
        // Kullanıcının published çizimini bul
        try {
            const response = await fetch(`${API_BASE_URL}/drawings?limit=100`);
            if (response.ok) {
                const data = await response.json();
                // Handle new paginated response format
                const allDrawings = data.drawings || data;
                const userDrawing = allDrawings.find(drawing =>
                    drawing.userId === currentUser._id ||
                    drawing.creatorUsername === currentUser.username
                );

                if (userDrawing) {
                    showUserPublishedDrawing(userDrawing);
                }
            }
        } catch (error) {
            console.error('Error fetching user drawing:', error);
        }
    }
}

function showUserPublishedDrawing(drawing) {
    if (!elements.canvas || !elements.ctx) return;

    // Önce herhangi bir existing overlay'i temizle
    const existingOverlay = document.querySelector('.published-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Kullanıcının çizimini canvas'a yükle
    const img = new Image();
    img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = elements.canvas.clientWidth;
        const cssHeight = elements.canvas.clientHeight;

        // Canvas'ı temizle ve çizimi göster
        elements.ctx.clearRect(0, 0, cssWidth, cssHeight);
        elements.ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

        // PUBLISHED çerçeve overlay'ini göster
        showPublishedFrameOverlay();
    };
    img.src = drawing.image;

    // Canvas'ı devre dışı bırak
    disableCanvas();
}

function showPublishedFrameOverlay() {
    const horseImageContainer = document.querySelector('.horse-image');
    if (horseImageContainer && !horseImageContainer.querySelector('.published-frame-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'published-frame-overlay';
        overlay.innerHTML = `
            <div class="published-border">
                <div class="published-label">PUBLISHED</div>
                <div class="published-info">Your entry for this week's competition</div>
            </div>
        `;
        horseImageContainer.appendChild(overlay);
    }
}

function disableCanvas() {
    if (elements.canvas) {
        elements.canvas.style.pointerEvents = 'none';
        // Opacity kaldırdık, sadece CSS filter ile hafif efekt
    }

    // Drawing area'ya published class ekle
    const drawingArea = document.querySelector('.drawing-area');
    if (drawingArea) {
        drawingArea.classList.add('published');
    }

    // Tüm çizim araçlarını devre dışı bırak
    const toolButtons = document.querySelectorAll('.action-btn');
    toolButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });

    if (elements.brushSize) elements.brushSize.disabled = true;
    if (elements.colorPicker) elements.colorPicker.disabled = true;
}

function renderAdminDrawingsTable(drawings) {
    if (!elements.adminDrawingsTableBody) return;
    elements.adminDrawingsTableBody.innerHTML = '';
    if (!drawings || drawings.length === 0) {
        elements.adminDrawingsTableBody.innerHTML = '<tr><td colspan="7" class="no-results-admin">No drawings found.</td></tr>';
        return;
    }
    drawings.forEach(drawing => {
        const row = elements.adminDrawingsTableBody.insertRow();
        row.innerHTML = `
            <td><img src="${drawing.image}" alt="${drawing.title || 'Untitled'}" class="admin-preview-img"></td>
            <td data-label="Title">${drawing.title || 'Untitled'}</td>
            <td data-label="Creator">${drawing.creatorUsername || 'N/A'}</td>
            <td data-label="Likes">${drawing.likes?.length || 0}</td>
            <td data-label="Comments">${drawing.comments?.length || 0}</td>
            <td data-label="Created">${new Date(drawing.createdAt).toLocaleString()}</td>
            <td data-label="Actions">
                <i class="fas fa-trash-alt action-icon delete-icon" title="Delete Drawing" 
                   data-drawing-id="${drawing._id}" data-drawing-title="${drawing.title || 'Untitled'}"
                   aria-label="Delete Drawing" tabindex="0" role="button"></i>
            </td>
        `;
    });
}

async function handleAdminAction(action, id, additionalData = {}) {
    const token = localStorage.getItem('authToken');
    let url, method, body;
    let confirmationMessage = 'Are you sure?';

    switch (action) {
        case 'toggleAdmin':
            url = `${API_BASE_URL}/admin/users/${id}/toggle-admin`;
            method = 'PUT';
            // additionalData.isAdmin should be a string "true" or "false" from dataset
            const isAdminBool = additionalData.isAdmin === 'true';
            confirmationMessage = `Are you sure you want to ${isAdminBool ? 'revoke' : 'grant'} admin rights for ${additionalData.username}?`;
            break;
        case 'deleteUser':
            url = `${API_BASE_URL}/admin/users/${id}`;
            method = 'DELETE';
            confirmationMessage = `Are you sure you want to delete user ${additionalData.username}? This cannot be undone. Associated drawings will be anonymized.`;
            break;
        case 'deleteDrawing':
            url = `${API_BASE_URL}/admin/drawings/${id}`;
            method = 'DELETE';
            confirmationMessage = `Are you sure you want to delete drawing "${additionalData.title}"? This cannot be undone.`;
            break;
        case 'resetGallery':
            url = `${API_BASE_URL}/admin/reset-gallery`;
            method = 'DELETE';
            confirmationMessage = "DANGER ZONE! Are you absolutely sure you want to delete ALL drawings and reset ALL non-admin user publish rights? This action is irreversible!";
            break;
        default:
            return;
    }

    if (!confirm(confirmationMessage)) return;

    try {
        const fetchOptions = {
            method,
            headers: { 'Authorization': `Bearer ${token}` }
        };
        if (body) {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        }
        const response = await fetch(url, fetchOptions);
        const data = await response.json();

        if (response.ok) {
            showNotification(data.message || 'Action successful!', 'success');
            if (action === 'toggleAdmin' || action === 'deleteUser' || action === 'resetGallery') {
                await loadAdminUsers(); // Refresh user list
            }
            if (action === 'deleteDrawing' || action === 'resetGallery') {
                await loadAdminDrawings(); // Refresh drawing list
            }
            if (action === 'resetGallery') {
                // Potentially refresh current user state if their publish status might have changed
                await checkAuthState();
            }
        } else {
            showNotification(data.message || 'Action failed.', 'error');
        }
    } catch (error) {
        showNotification(`Error performing action: ${error.message}`, 'error');
    }
}


/**
 * Event Listener Setup
 */
function setupEventListeners() {
    // Canvas Listeners (if on draw page)
    if (elements.canvas) {
        elements.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (isFilling) {
                const logicalCoords = getCoordinates(e);
                const dpr = window.devicePixelRatio || 1;
                const physicalX = Math.floor(logicalCoords.x * dpr);
                const physicalY = Math.floor(logicalCoords.y * dpr);
                floodFill(physicalX, physicalY, elements.ctx);
                saveCanvasState();
            } else {
                startDrawing(e);
            }
        });
        elements.canvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            draw(e);
        });
        elements.canvas.addEventListener('mouseup', stopDrawing);
        elements.canvas.addEventListener('mouseleave', stopDrawing);
        elements.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        elements.canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        elements.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        elements.clearBtn.addEventListener('click', clearCanvas);
        elements.undoBtn.addEventListener('click', undoLastAction);
        if (elements.redoBtn) { // Check if Redo button exists
            elements.redoBtn.addEventListener('click', redoLastAction);
        }

        // Pen Tool Listener
        if (elements.penBtn) {
            elements.penBtn.addEventListener('click', () => {
                activatePenMode();
                elements.penBtn.classList.add('active');
                elements.eraserBtn.classList.remove('active');
                elements.fillBtn.classList.remove('active');
            });
        }

        elements.eraserBtn.addEventListener('click', () => {
            isErasing = !isErasing;
            isFilling = false;
            isPenActive = false;

            elements.eraserBtn.classList.toggle('active', isErasing);
            elements.fillBtn.classList.remove('active');
            if (elements.penBtn) elements.penBtn.classList.remove('active');

            elements.colorButtons.forEach(btn => btn.classList.remove('active'));
            elements.brushSize.disabled = false;

            if (elements.canvas) {
                if (isErasing) {
                    elements.canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 11.5h19v3h-19z"/><path d="M8.5 8.5l7 7"/><path d="M15.5 8.5l-7 7"/></svg>') 12 12, crosshair`;
                } else {
                    activatePenMode();
                }
            }
            updateBrushPreview();
        });

        elements.fillBtn.addEventListener('click', () => {
            isFilling = !isFilling;
            isErasing = false;
            isPenActive = false;

            elements.fillBtn.classList.toggle('active', isFilling);
            elements.eraserBtn.classList.remove('active');
            if (elements.penBtn) elements.penBtn.classList.remove('active');

            elements.colorButtons.forEach(btn => btn.classList.remove('active'));
            elements.brushSize.disabled = isFilling;

            if (elements.canvas) {
                if (isFilling) {
                    elements.canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 13h-2.5v-2.5H11v2.5H8.5V14H11v-2.5h2.5V14H16v2zm0-5.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v3.5zM5 19V5h14v14H5z"/><path d="M0 0h24v24H0z" fill="none"/><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>') 12 12, crosshair`;
                } else {
                    activatePenMode();
                }
            }
            updateBrushPreview();
        });

        elements.colorPicker.addEventListener('input', (e) => {
            currentColor = e.target.value;
            activatePenMode();
            elements.colorButtons.forEach(btn => btn.classList.remove('active'));
            updateBrushPreview();
        });

        elements.brushSize.addEventListener('input', (e) => {
            currentBrushSize = parseInt(e.target.value);
            updateBrushPreview();
        });

        // Decrease Brush Size Button Listener
        if (elements.decreaseBrushSizeBtn) {
            elements.decreaseBrushSizeBtn.addEventListener('click', () => {
                let newSize = Math.max(1, currentBrushSize - 1);
                elements.brushSize.value = newSize;
                currentBrushSize = newSize;
                updateBrushPreview();
            });
        }

        // Increase Brush Size Button Listener
        if (elements.increaseBrushSizeBtn) {
            elements.increaseBrushSizeBtn.addEventListener('click', () => {
                let newSize = Math.min(50, currentBrushSize + 1);
                elements.brushSize.value = newSize;
                currentBrushSize = newSize;
                updateBrushPreview();
            });
        }

        elements.colorButtons.forEach(button => {
            button.addEventListener('click', () => {
                currentColor = button.dataset.color;
                activatePenMode();
                elements.colorButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                updateBrushPreview();
            });
        });

        elements.publishBtn.addEventListener('click', () => {
            if (!currentUser) {
                showNotification('Please login to publish your drawing.', 'info');
                return;
            }
            if (currentUser.hasPublished && !currentUser.isAdmin) {
                showNotification("You've already published a drawing for this competition! Admins can publish multiple times for testing.", "error");
                return;
            }

            if (elements.publishModal && elements.drawingPreview) {
                const combinedImage = combineCanvasWithHorse();
                if (combinedImage) {
                    elements.drawingPreview.src = combinedImage;
                    elements.publishModal.style.display = 'flex';
                } else {
                    showNotification('Could not generate preview. Try drawing something!', 'error');
                }
            }
        });

        window.addEventListener('resize', () => {
            if (elements.canvas && (window.location.pathname.includes('index.html') || window.location.pathname === '/')) {
                setCanvasSize();
            }
        });

        // Keyboard shortcut for Undo (Ctrl+Z or Cmd+Z) and Redo (Ctrl+Y or Cmd+Y)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undoLastAction();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redoLastAction();
            }
        });
    }

    // Publish Modal Listeners
    if (elements.confirmPublishBtn) {
        elements.confirmPublishBtn.addEventListener('click', handlePublishDrawing);
    }

    // Gallery Page Listeners
    if (elements.filterBar) {
        elements.filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                elements.filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                currentFilter = button.dataset.filter;
                currentPage = 1;
                loadDrawings(currentFilter, currentSearchQuery);
            });
        });

        elements.searchBtn.addEventListener('click', () => {
            currentSearchQuery = elements.searchInput.value.trim();
            currentPage = 1;
            loadDrawings(currentFilter, currentSearchQuery);
        });
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Enter tuşunun form submit etmesini engelle
                currentSearchQuery = elements.searchInput.value.trim();
                currentPage = 1;
                loadDrawings(currentFilter, currentSearchQuery);
            }
        });

        elements.prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadDrawings(currentFilter, currentSearchQuery);
            }
        });
        elements.nextPageBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                loadDrawings(currentFilter, currentSearchQuery);
            }
        });
    }

    // Drawing View from Hash (Gallery & Leaderboard)
    window.addEventListener('hashchange', async () => {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#drawing=')) {
            const drawingId = hash.split('=')[1];
            if (drawingId) {
                try {
                    const response = await fetch(`${API_BASE_URL}/drawings/${drawingId}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch drawing ${drawingId}: ${response.status}`);
                    }
                    const drawingItem = await response.json();
                    openDrawingView(drawingItem);
                } catch (error) {
                    console.error('Error loading drawing from hash:', error);
                    showNotification(`Could not load drawing: ${error.message}`, 'error');
                }
            }
        } else {
            if (elements.viewDrawingModal && elements.viewDrawingModal.style.display === 'flex') {
                closeModal(elements.viewDrawingModal);
            }
        }
    });
    // Initial check for hash on page load
    if (window.location.hash && window.location.hash.startsWith('#drawing=')) {
        const drawingId = window.location.hash.split('=')[1];
        (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/drawings/${drawingId}`);
                if (!response.ok) throw new Error(`Failed to fetch drawing ${drawingId}: ${response.status}`);
                const drawingItem = await response.json();
                openDrawingView(drawingItem);
            } catch (error) {
                console.error('Error loading initial drawing from hash:', error);
                showNotification(`Could not load drawing: ${error.message}`, 'error');
            }
        })();
    }

    // Drawing View Modal Listeners
    if (elements.likeDrawingBtn) elements.likeDrawingBtn.addEventListener('click', likeDrawing);
    if (elements.submitCommentBtn) elements.submitCommentBtn.addEventListener('click', submitComment);
    if (elements.commentInput) {
        elements.commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment();
            }
        });
    }
    if (elements.shareDrawingBtn) elements.shareDrawingBtn.addEventListener('click', openShareModal);
    if (elements.reportDrawingBtn) elements.reportDrawingBtn.addEventListener('click', openReportModal);

    // Share Modal Listeners
    if (elements.copyLinkBtn && elements.shareLink) {
        elements.copyLinkBtn.addEventListener('click', () => {
            elements.shareLink.select();
            document.execCommand('copy');
            showNotification('Link copied to clipboard!', 'success');
        });
    }
    if (elements.shareModal) {
        elements.shareModal.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const platform = btn.dataset.platform;
                const url = elements.shareLink.value;
                let shareUrl;
                switch (platform) {
                    case 'twitter':
                        shareUrl = `https://twitter.com/intent/tweet?url=<span class="math-inline">\{encodeURIComponent\(url\)\}&text\=</span>{encodeURIComponent('Check out this awesome drawing on HALF-HORSE!')}`;
                        break;
                    case 'facebook':
                        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
                        break;
                    case 'whatsapp':
                        shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent('Check out this awesome drawing on HALF-HORSE! ' + url)}`;
                        break;
                    case 'telegram':
                        shareUrl = `https://t.me/share/url?url=<span class="math-inline">\{encodeURIComponent\(url\)\}&text\=</span>{encodeURIComponent('Check out this awesome drawing on HALF-HORSE!')}`;
                        break;
                    default: return;
                }
                window.open(shareUrl, '_blank');
            });
        });
    }

    // Report Modal Listeners
    if (elements.reportForm && elements.submitReportBtn) {
        elements.reportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) {
                showNotification('You must be logged in to report content.', 'error');
                return;
            }
            const reason = elements.reportReason.value;
            const description = elements.reportDescription.value;
            if (!reason) {
                showNotification('Please select a reason for the report.', 'error');
                return;
            }

            elements.submitReportBtn.disabled = true;
            elements.submitReportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch(`${API_BASE_URL}/drawings/${currentDrawing._id}/report`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ reason, description })
                });
                if (response.ok) {
                    showNotification('Report submitted successfully. Thank you for helping keep our community safe.', 'success');
                    closeModal(elements.reportModal);
                } else {
                    const errorData = await response.json();
                    showNotification(errorData.message || 'Failed to submit report.', 'error');
                }
            } catch (error) {
                showNotification('Error submitting report. Please try again.', 'error');
            } finally {
                elements.submitReportBtn.disabled = false;
                elements.submitReportBtn.innerHTML = 'Submit Report';
            }
        });
    }

    // Auth Form Listeners - Bu kısım TEMİZLENDİ
    // if (elements.loginForm) elements.loginForm.addEventListener('submit', handleLogin);
    // if (elements.signupForm) elements.signupForm.addEventListener('submit', handleSignup);
    // if (elements.forgotPasswordForm) elements.forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    // if (elements.resetPasswordForm) elements.resetPasswordForm.addEventListener('submit', handleResetPassword);

    // Profile Page Listeners
    if (elements.updateProfileForm) elements.updateProfileForm.addEventListener('submit', handleUpdateProfile);
    if (elements.profileAvatarUpload) elements.profileAvatarUpload.addEventListener('change', handleProfilePictureUpload);
    // if (elements.changePasswordForm) elements.changePasswordForm.addEventListener('submit', handleChangePassword); // Password change kaldırıldı
    if (elements.profilePageLogoutBtn) elements.profilePageLogoutBtn.addEventListener('click', handleLogout);

    // Admin Panel Listeners
    if (elements.adminPanelContainer) {
        if (elements.adminUserSearch) {
            elements.adminUserSearch.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filteredUsers = adminUsersCache.filter(user =>
                    user.username.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
                );
                renderAdminUsersTable(filteredUsers);
            });
        }
        if (elements.adminRefreshUsersBtn) elements.adminRefreshUsersBtn.addEventListener('click', loadAdminUsers);

        if (elements.adminUsersTableBody) {
            elements.adminUsersTableBody.addEventListener('click', (e) => {
                if (e.target.classList.contains('toggle-admin-icon')) {
                    const userId = e.target.dataset.userId;
                    const username = e.target.dataset.username;
                    const isAdmin = e.target.dataset.isAdmin;
                    handleAdminAction('toggleAdmin', userId, { username, isAdmin });
                } else if (e.target.classList.contains('delete-icon')) {
                    const userId = e.target.dataset.userId;
                    const username = e.target.dataset.username;
                    handleAdminAction('deleteUser', userId, { username });
                }
            });
            elements.adminUsersTableBody.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.classList.contains('toggle-admin-icon')) {
                        const userId = e.target.dataset.userId;
                        const username = e.target.dataset.username;
                        const isAdmin = e.target.dataset.isAdmin;
                        handleAdminAction('toggleAdmin', userId, { username, isAdmin });
                    } else if (e.target.classList.contains('delete-icon')) {
                        const userId = e.target.dataset.userId;
                        const username = e.target.dataset.username;
                        handleAdminAction('deleteUser', userId, { username });
                    }
                }
            });
        }

        if (elements.adminDrawingSearch) {
            elements.adminDrawingSearch.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filteredDrawings = adminDrawingsCache.filter(drawing =>
                    (drawing.title && drawing.title.toLowerCase().includes(query)) ||
                    (drawing.creatorUsername && drawing.creatorUsername.toLowerCase().includes(query))
                );
                renderAdminDrawingsTable(filteredDrawings);
            });
        }
        if (elements.adminRefreshDrawingsBtn) elements.adminRefreshDrawingsBtn.addEventListener('click', loadAdminDrawings);

        if (elements.adminDrawingsTableBody) {
            elements.adminDrawingsTableBody.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-icon')) {
                    const drawingId = e.target.dataset.drawingId;
                    const title = e.target.dataset.drawingTitle;
                    handleAdminAction('deleteDrawing', drawingId, { title });
                }
            });
            elements.adminDrawingsTableBody.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.classList.contains('delete-icon')) {
                        const drawingId = e.target.dataset.drawingId;
                        const title = e.target.dataset.drawingTitle;
                        handleAdminAction('deleteDrawing', drawingId, { title });
                    }
                }
            });
        }

        if (elements.adminResetGalleryBtn) {
            elements.adminResetGalleryBtn.addEventListener('click', () => {
                handleAdminAction('resetGallery', null);
            });
        }
    }
}