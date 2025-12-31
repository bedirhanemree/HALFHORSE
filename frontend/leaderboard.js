/**
 * Leaderboard Handler for Horse Gallery
 * Displays the top drawings based on likes
 */
(function () {
    // Constants
    const MAX_LEADERBOARD_ENTRIES = 20;

    // Local variables
    let lbTopDrawingsCache = [];

    // DOM Elements
    const leaderboardEntriesEl = document.getElementById('leaderboardEntries');

    /**
     * Initialize the leaderboard when the page loads
     */
    document.addEventListener('DOMContentLoaded', async function () {
        console.log('Leaderboard page initialized');

        // Wait for main script to load
        setTimeout(async () => {
            if (typeof window.checkAuthState === 'function') {
                await window.checkAuthState();
            }

            await loadLeaderboardData();

            if (typeof window.setupModalControls === 'function') {
                window.setupModalControls();
            }

            setupLeaderboardEvents();

            window.refreshLeaderboardData = loadLeaderboardData;
        }, 200);
    });

    /**
     * Setup event listeners for the leaderboard page
     */
    function setupLeaderboardEvents() {
        const podiumDrawings = document.querySelectorAll('.podium-drawing');
        podiumDrawings.forEach(drawingEl => {
            drawingEl.style.cursor = 'pointer';
        });

        window.addEventListener('hashchange', handleHashChange);
        handleHashChange();
    }

    /**
     * Handle hash changes in the URL to show specific drawings
     */
    async function handleHashChange() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#drawing=')) {
            const drawingId = hash.split('=')[1];
            if (drawingId) {
                console.log(`Leaderboard: Looking for drawing with ID from hash: ${drawingId}`);

                let drawing = lbTopDrawingsCache.find(d => d._id === drawingId);

                if (drawing) {
                    openDrawingViewModal(drawing);
                } else {
                    await fetchAndOpenDrawing(drawingId);
                }
            }
        } else {
            const viewModal = document.getElementById('viewDrawingModal');
            if (viewModal && viewModal.style.display === 'flex' && typeof window.closeModal === 'function') {
                window.closeModal(viewModal);
            }
        }
    }

    /**
     * Fetch a specific drawing by ID and open the view modal using global functions
     */
    async function fetchAndOpenDrawing(drawingId) {
        try {
            const apiUrl = (typeof window.API_URL !== 'undefined') ? window.API_URL : 'http://68.183.126.45:5000/api';
            const response = await fetch(`${apiUrl}/drawings/${drawingId}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch drawing: ${response.status}`);
            }

            const drawing = await response.json();
            openDrawingViewModal(drawing);

        } catch (error) {
            console.error('Error fetching drawing:', error);
            if (typeof window.showNotification === 'function') {
                window.showNotification(`Error loading drawing: ${error.message}`, 'error');
            } else {
                alert(`Error loading drawing: ${error.message}`);
            }
        }
    }

    /**
     * Opens the drawing view modal using global functions from script.js
     */
    function openDrawingViewModal(drawingItem) {
        if (typeof window.setCurrentDrawing === 'function') {
            window.setCurrentDrawing(drawingItem);
        } else {
            console.error("Global setCurrentDrawing function not found!");
            return;
        }

        if (typeof window.openDrawingView === 'function') {
            window.openDrawingView(drawingItem);
            window.location.hash = `drawing=${drawingItem._id}`;
        } else {
            console.error('Global openDrawingView function not found!');
        }
    }

    function showSkeleton() {
        // Podium skeleton - updatePodium yerine direct HTML
        const podiumSpots = ['first-place', 'second-place', 'third-place'];
        podiumSpots.forEach(spotId => {
            const spot = document.getElementById(spotId);
            if (spot) {
                const drawing = spot.querySelector('.podium-drawing img');
                const avatar = spot.querySelector('.podium-avatar img');
                const name = spot.querySelector('.podium-info h3');

                if (drawing) drawing.style.display = 'none';
                if (avatar) avatar.style.display = 'none';
                if (name) name.textContent = '-';
            }
        });

        // Liste skeleton
        if (leaderboardEntriesEl) {
            leaderboardEntriesEl.innerHTML = createSkeletonList();
        }
    }

    /**
     * Load leaderboard data from the API
     */
    async function loadLeaderboardData() {
        if (!leaderboardEntriesEl) return;

        // 1. Skeleton göster
        showSkeleton();

        try {
            const apiUrl = (typeof window.API_URL !== 'undefined') ? window.API_URL : 'http://68.183.126.45:5000/api';

            // Use the optimized /api/leaderboard endpoint
            const response = await fetch(`${apiUrl}/leaderboard?limit=20`);

            if (!response.ok) {
                throw new Error(`Failed to fetch drawings: ${response.status} ${response.statusText}`);
            }

            const allDrawings = await response.json();

            if (!allDrawings || allDrawings.length === 0) {
                leaderboardEntriesEl.innerHTML = '<div class="no-results">No drawings available yet. Be the first to publish!</div>';
                updatePodium([]);
                return;
            }

            // Process drawings - already sorted by server
            const processedDrawings = allDrawings.map(drawing => ({
                ...drawing,
                likeCount: drawing.likesCount || (Array.isArray(drawing.likes) ? drawing.likes.length : 0)
            }));

            lbTopDrawingsCache = processedDrawings;

            // 2. Gerçek veriyi göster
            updatePodium(lbTopDrawingsCache);
            renderLeaderboardEntries(lbTopDrawingsCache);
            handleHashChange();

        } catch (error) {
            console.error('Error loading leaderboard data:', error);
            leaderboardEntriesEl.innerHTML = `
            <div class="error-message">
                <h3>Error Loading Leaderboard</h3>
                <p>Failed to fetch. Please try again.</p>
                <button onclick="window.refreshLeaderboardData()" class="primary-btn">
                    Try Again
                </button>
            </div>
        `;
            updatePodium([]);
        }
    }

    /**
     * Update the podium with the top 3 drawings and prize information
     */
    function updatePodium(drawings) {
        const podiumSpots = [
            { idPrefix: 'gold', drawingIndex: 0, prize: '$1000 Prize' },
            { idPrefix: 'silver', drawingIndex: 1, prize: '$500 Prize' },
            { idPrefix: 'bronze', drawingIndex: 2, prize: '$250 Prize' }
        ];

        podiumSpots.forEach(spot => {
            const drawingData = drawings.length > spot.drawingIndex ? drawings[spot.drawingIndex] : null;
            const drawingEl = document.getElementById(`${spot.idPrefix}-drawing`);
            const nameEl = document.getElementById(`${spot.idPrefix}-name`);
            const likesEl = document.getElementById(`${spot.idPrefix}-likes`);
            const titleEl = document.getElementById(`${spot.idPrefix}-title`);
            const avatarEl = document.getElementById(`${spot.idPrefix}-avatar`);

            if (drawingData) {
                const likesCount = drawingData.likeCount || 0;

                if (drawingEl) {
                    drawingEl.src = drawingData.image;
                    drawingEl.alt = drawingData.title || `${spot.idPrefix} Place Drawing`;
                    drawingEl.onclick = () => openDrawingViewModal(drawingData);
                    drawingEl.style.cursor = 'pointer';
                    drawingEl.style.display = 'block';
                }
                if (nameEl) {
                    nameEl.innerHTML = `${drawingData.creatorUsername || 'Unknown'} <span class="prize-value">(${spot.prize})</span>`;
                }
                if (likesEl) likesEl.textContent = likesCount;
                if (titleEl) titleEl.textContent = drawingData.title || 'Untitled';
                if (avatarEl) {
                    avatarEl.src = drawingData.creatorAvatar || 'assets/default-avatar.png';
                    avatarEl.alt = `${drawingData.creatorUsername || 'Unknown'} Avatar`;
                    avatarEl.style.display = 'block';
                }
            }
        });
    }

    /**
     * Render the leaderboard entries (4th position onwards) with prize information
     */
    function renderLeaderboardEntries(drawings) {
        if (!leaderboardEntriesEl) return;
        leaderboardEntriesEl.innerHTML = '';

        const startIndex = 3;
        const drawingsForList = drawings.slice(startIndex);

        if (drawingsForList.length === 0 && drawings.length > 0 && drawings.length <= startIndex) {
            leaderboardEntriesEl.innerHTML = `
                <div class="no-more-entries" style="text-align: center; padding: 20px; color: #aaa;">
                    <i class="fas fa-trophy" style="font-size: 2em; margin-bottom: 10px; opacity: 0.3;"></i>
                    <p>Only the top ${drawings.length} ${drawings.length === 1 ? 'drawing is' : 'drawings are'} on the podium.</p>
                    <p>More entries will appear here as artists publish their work!</p>
                </div>
            `;
            return;
        }

        if (drawingsForList.length === 0 && drawings.length === 0) {
            leaderboardEntriesEl.innerHTML = `
                <div class="no-more-entries" style="text-align: center; padding: 40px; color: #aaa;">
                    <i class="fas fa-trophy" style="font-size: 3em; margin-bottom: 20px; opacity: 0.3;"></i>
                    <h3>No Drawings Yet!</h3>
                    <p>Be the first to publish a drawing and claim the top spot!</p>
                    <a href="index.html" class="primary-btn" style="margin-top: 20px;">
                        <i class="fas fa-paint-brush"></i> Start Drawing
                    </a>
                </div>
            `;
            return;
        }

        drawingsForList.forEach((drawing, index) => {
            const rank = startIndex + index + 1;
            const likes = drawing.likeCount || 0;

            const entryElement = document.createElement('div');
            entryElement.className = 'leaderboard-entry';
            entryElement.setAttribute('role', 'button');
            entryElement.tabIndex = 0;
            const rankClass = rank <= 6 ? `rank-${rank}` : '';

            let prizeIndicator = '';
            if (rank >= 4 && rank <= 20) {
                prizeIndicator = ' <span class="prize-value-list">($100 Prize Candidate)</span>';
            }

            entryElement.innerHTML = `
                <div class="rank-col ${rankClass}">#${rank}</div>
                <div class="drawing-col">
                    <div class="entry-drawing">
                        <img src="${drawing.image}" alt="${drawing.title || 'Untitled'}" loading="lazy">
                    </div>
                </div>
                <div class="artist-col">
                    <div class="entry-artist">
                        <div class="entry-artist-avatar">
                            <img src="${drawing.creatorAvatar || 'assets/default-avatar.png'}" alt="${drawing.creatorUsername || 'Unknown'}">
                        </div>
                        <div class="entry-artist-name">${drawing.creatorUsername || 'Unknown'}${prizeIndicator}</div>
                    </div>
                </div>
                <div class="title-col">
                    <div class="entry-title">${drawing.title || 'Untitled'}</div>
                </div>
                <div class="likes-col">
                    <div class="entry-likes">
                        <span>${likes}</span>
                        <i class="fas fa-heart"></i>
                    </div>
                </div>
            `;

            const openEntry = () => openDrawingViewModal(drawing);
            entryElement.addEventListener('click', openEntry);
            entryElement.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openEntry(); });
            leaderboardEntriesEl.appendChild(entryElement);
        });

        console.log('Rendered', drawingsForList.length, 'leaderboard entries');
    }
})();