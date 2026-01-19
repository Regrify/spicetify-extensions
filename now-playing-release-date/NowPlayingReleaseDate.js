// NowPlayingReleaseDate — single pasteable script
// Paste the entire contents of this file into the Spotify/Spicetify console OR save to the extension file and run `spicetify apply`.
// Debug: toggle with localStorage.setItem('nprd-debug','true') before pasting, or call window.__NowPlayingReleaseDate.toggleDebug(true).

(function () {
    console.log('[Now Playing Release Date] loaded (single-paste)');

    // Cleanup previous instance if present to allow re-pasting safely
    if (window.__NowPlayingReleaseDate && typeof window.__NowPlayingReleaseDate.cleanup === 'function') {
        try {
            window.__NowPlayingReleaseDate.cleanup();
        } catch (e) { /* ignore cleanup errors */ }
    }

    // Use localStorage for persistent debug toggle so you don't need to edit code
    let debugMode = localStorage.getItem('nprd-debug') === 'true';
    window.__NPRD_debug = debugMode; // exposure for console

    // Internal state holder so we can cleanup later
    const state = {
        domObserver: null,
        songChangeHandler: null,
        initialized: false
    };

    // Expose cleanup and state on window for future re-pastes
    window.__NowPlayingReleaseDate = {
        state,
        cleanup: cleanup
    };

    // Utility: wait for Spicetify to exist
    async function waitForSpicetify() {
        while (typeof Spicetify === "undefined" || !Spicetify) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async function waitForTrackData() {
        while (!Spicetify?.Player?.data || !Spicetify.Player.data.item) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    function spotifyHex(spotifyId) {
        const INVALID = "00000000000000000000000000000000";
        if (typeof spotifyId !== "string") return INVALID;
        if (spotifyId.length === 0 || spotifyId.length > 22) return INVALID;
        const characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let decimalValue = BigInt(0);
        for (let i = 0; i < spotifyId.length; i++) {
            const index = characters.indexOf(spotifyId[i]);
            if (index === -1) return INVALID;
            decimalValue = decimalValue * BigInt(62) + BigInt(index);
        }
        const hexValue = decimalValue.toString(16).padStart(32, "0");
        if (hexValue.length > 32) return INVALID;
        return hexValue;
    }

    const positions = [
        { value: ".main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists", text: "Artist" },
        { value: ".main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name", text: "Song name" }
    ];
    const dateformat = [
        { value: "DD-MM-YYYY", text: "DD-MM-YYYY" },
        { value: "MM-DD-YYYY", text: "MM-DD-YYYY" },
        { value: "YYYY-MM-DD", text: "YYYY-MM-DD" }
    ];
    const separator = [
        { value: "•", text: "Dot" },
        { value: "-", text: "Dash" },
        { value: "", text: "None" }
    ];

    if (!localStorage.getItem('position')) {
        localStorage.setItem('position', positions[1].value);
    }
    if (!localStorage.getItem('dateFormat')) {
        localStorage.setItem('dateFormat', dateformat[0].value);
    }
    if (!localStorage.getItem('separator')) {
        localStorage.setItem('separator', separator[0].value);
    }

    const fallbackSelectors = [
        '.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists',
        '.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name',
        '.main-nowPlayingWidget-trackInfo .main-trackInfo-container',
        '[data-testid="now-playing-widget"] .main-trackInfo-name',
        '.now-playing .track-info__name',
        '.Root__now-playing-bar'
    ];

    function log(...args) {
        if (debugMode) console.log('[NPRD]', ...args);
    }

    async function releaseDateCSS() {
        await waitForSpicetify();
        const style = document.createElement('style');
        style.id = 'nprd-style';
        style.innerHTML = `
            #releaseDate { display:inline-flex; align-items:center; gap:6px; }
            #releaseDate span, #releaseDate a { display:inline-block; color:var(--text-subdued); cursor:pointer; }
            .main-nowPlayingWidget-nowPlaying .main-trackInfo-artists,
            .main-nowPlayingWidget-nowPlaying .main-trackInfo-name { display:flex; align-items:center; gap:6px; white-space:nowrap; }
            #settingsMenu { display:none; position:absolute; background:var(--spice-main); padding:12px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.3); min-width:220px; }
            #settingsMenu h2 { margin:0 0 8px 0; padding-bottom:6px; border-bottom:1px solid var(--spice-subtext); color:var(--spice-text); }
            .Dropdown-container { display:flex; justify-content:space-between; gap:10px; margin-top:6px; align-items:center; }
            .releaseDateDropdown-control { background:var(--spice-main); color:var(--spice-text); border:1px solid var(--spice-subtext); padding:4px; max-width:10rem; }
        `;
        return style;
    }

    // Defensive parsing of album and date from various shapes
    async function getTrackDetailsRD() {
        await waitForTrackData();
        const item = Spicetify.Player?.data?.item;
        log('Player.item:', item);

        let trackDetails = null;
        let album = null;
        let releaseDate = null;
        let releaseDateString = '';

        if (item) {
            try {
                const albumFromItem = item.album || item.album_urn || item.albumMetadata || item.albumData || null;
                const possibleReleaseDate = albumFromItem?.release_date || albumFromItem?.releaseDate || albumFromItem?.date || item?.release_date || item?.date || null;

                if (possibleReleaseDate) {
                    if (typeof possibleReleaseDate === 'string') {
                        const parts = possibleReleaseDate.split("-");
                        const year = parseInt(parts[0], 10) || 1970;
                        const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
                        const day = parts[2] ? parseInt(parts[2], 10) : 1;
                        releaseDate = new Date(year, month, day);
                        releaseDateString = possibleReleaseDate.length === 4 ? `${possibleReleaseDate}-01-01` : (possibleReleaseDate.length === 7 ? `${possibleReleaseDate}-01` : possibleReleaseDate);
                    } else if (typeof possibleReleaseDate === 'object' && (possibleReleaseDate.year || possibleReleaseDate.month)) {
                        releaseDate = new Date(possibleReleaseDate.year, (possibleReleaseDate.month || 1) - 1, possibleReleaseDate.day || 1);
                        releaseDateString = `${possibleReleaseDate.year}-${String(possibleReleaseDate.month || 1).padStart(2,'0')}-${String(possibleReleaseDate.day || 1).padStart(2,'0')}`;
                    }
                }

                if (albumFromItem) {
                    const artists = albumFromItem.artists || albumFromItem.artist || item.artists || item.artist || [];
                    const imagesRaw = (albumFromItem.images && albumFromItem.images.length) ? albumFromItem.images : (albumFromItem.cover_group?.image || []);
                    album = {
                        name: albumFromItem.name || albumFromItem.title || '',
                        artists: Array.isArray(artists) ? artists.map(a => ({ name: a.name || a })) : [{ name: artists.name || artists }],
                        album_type: albumFromItem.album_type || 'album',
                        gid: albumFromItem.gid || albumFromItem.id || '',
                        external_urls: { spotify: albumFromItem.external_urls?.spotify || item?.external_urls?.spotify || '' },
                        images: (imagesRaw || []).map(img => {
                            if (img.url && img.url.startsWith('http')) return { url: img.url, width: img.width || 64, height: img.height || 64 };
                            if (img.file_id) return { url: `https://i.scdn.co/image/${img.file_id}`, width: img.width || 64, height: img.height || 64 };
                            return { url: img, width: 64, height: 64 };
                        })
                    };
                }
            } catch (e) {
                log('parsing item failed, will fallback to Cosmos', e);
            }
        }

        if ((!releaseDate || !album) && item?.uri) {
            try {
                const trackId = item.uri.split(":")[2];
                if (trackId) {
                    const hexId = spotifyHex(trackId);
                    trackDetails = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/metadata/4/track/${hexId}?market=from_token`);
                    log('Cosmos response:', trackDetails);
                    const alb = trackDetails?.album || trackDetails?.albumData || null;
                    if (alb) {
                        const dateObj = alb.date || alb.release_date || alb.releaseDate || null;
                        if (dateObj) {
                            if (typeof dateObj === 'string') {
                                const parts = dateObj.split("-");
                                const year = parseInt(parts[0], 10) || 1970;
                                const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
                                const day = parts[2] ? parseInt(parts[2], 10) : 1;
                                releaseDate = new Date(year, month, day);
                                releaseDateString = dateObj.length === 4 ? `${year}-01-01` : (dateObj.length === 7 ? `${year}-${String(month + 1).padStart(2,'0')}-01` : dateObj);
                            } else {
                                releaseDate = new Date(dateObj.year, (dateObj.month || 1) - 1, dateObj.day || 1);
                                releaseDateString = `${dateObj.year}-${String(dateObj.month || 1).padStart(2,'0')}-${String(dateObj.day || 1).padStart(2,'0')}`;
                            }
                        }

                        const artists = alb.artist || alb.artists || [];
                        const coverImages = (alb.cover_group && alb.cover_group.image) ? alb.cover_group.image : (alb.images || []);
                        album = {
                            name: alb.name || '',
                            artists: Array.isArray(artists) ? artists.map(a => ({ name: a.name || a })) : [{ name: artists.name || artists }],
                            album_type: alb.album_type || 'album',
                            gid: alb.gid || alb.id || '',
                            external_urls: { spotify: `spotify:album:${alb.gid || alb.id || ''}` },
                            images: (coverImages || []).map(img => {
                                if (img.file_id) return { url: `https://i.scdn.co/image/${img.file_id}`, width: img.width || 64, height: img.height || 64 };
                                if (img.url) return { url: img.url, width: img.width || 64, height: img.height || 64 };
                                return { url: img, width: 64, height: 64 };
                            })
                        };
                    }
                }
            } catch (e) { log('Cosmos fallback failed:', e); }
        }

        if (!album && item?.album) {
            album = {
                name: item.album.name || '',
                artists: (item.album.artists || []).map(a => ({ name: a.name || a })),
                album_type: item.album.album_type || 'album',
                gid: item.album.gid || '',
                external_urls: { spotify: item.album.external_urls?.spotify || '' },
                images: (item.album.images || []).map(img => ({ url: img.url || (img.file_id ? `https://i.scdn.co/image/${img.file_id}` : ''), width: img.width, height: img.height }))
            };
        }

        if (!releaseDateString && releaseDate instanceof Date && !isNaN(releaseDate)) {
            releaseDateString = `${releaseDate.getFullYear()}-${String(releaseDate.getMonth()+1).padStart(2,'0')}-${String(releaseDate.getDate()).padStart(2,'0')}`;
        }
        if (!releaseDateString && item?.album?.release_date) {
            const r = item.album.release_date;
            if (typeof r === 'string') releaseDateString = r.length === 4 ? `${r}-01-01` : r;
        }

        log('parsed album:', album);
        log('parsed releaseDate:', releaseDate, 'releaseDateString:', releaseDateString);

        const operatingSystem = (Spicetify.Platform && Spicetify.Platform.operatingSystem) ? Spicetify.Platform.operatingSystem : null;
        return { trackDetails, album, releaseDate, releaseDateString, operatingSystem };
    }

    function findContainer(selector) {
        if (selector) {
            try {
                const el = document.querySelector(selector);
                if (el) return { el, usedSelector: selector };
            } catch (e) { /* invalid selector */ }
        }
        for (const f of fallbackSelectors) {
            const el = document.querySelector(f);
            if (el) return { el, usedSelector: f };
        }
        return { el: null, usedSelector: null };
    }

    let domObserver = null;
    function observeForContainer(targetSelector, onFound, timeout = 8000) {
        const immediate = findContainer(targetSelector);
        if (immediate.el) {
            log('found container immediately using', immediate.usedSelector);
            onFound(immediate.el, immediate.usedSelector);
            return () => {};
        }

        if (domObserver) domObserver.disconnect();
        domObserver = new MutationObserver(() => {
            const found = findContainer(targetSelector);
            if (found.el) {
                log('found container via MutationObserver using', found.usedSelector);
                domObserver.disconnect();
                domObserver = null;
                onFound(found.el, found.usedSelector);
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
        const stop = () => { if (domObserver) { domObserver.disconnect(); domObserver = null; } };
        setTimeout(stop, timeout);
        return stop;
    }

    function formatDateForDisplay(releaseDate, releaseDateString) {
        const dateToFormat = releaseDate instanceof Date && !isNaN(releaseDate) ? releaseDate : null;
        switch (localStorage.getItem('dateFormat')) {
            case "DD-MM-YYYY":
                return dateToFormat ? `${String(dateToFormat.getDate()).padStart(2,'0')}-${String(dateToFormat.getMonth()+1).padStart(2,'0')}-${dateToFormat.getFullYear()}` : (releaseDateString || 'Unknown');
            case "MM-DD-YYYY":
                return dateToFormat ? `${String(dateToFormat.getMonth()+1).padStart(2,'0')}-${String(dateToFormat.getDate()).padStart(2,'0')}-${dateToFormat.getFullYear()}` : (releaseDateString || 'Unknown');
            case "YYYY-MM-DD":
                return dateToFormat ? `${dateToFormat.getFullYear()}-${String(dateToFormat.getMonth()+1).padStart(2,'0')}-${String(dateToFormat.getDate()).padStart(2,'0')}` : (releaseDateString || 'Unknown');
            default:
                return releaseDateString || 'Unknown';
        }
    }

    function createDivElement(id) {
        const d = document.createElement('div'); d.id = id; return d;
    }

    function createAnchorElement(textContent) {
        const a = document.createElement('a'); a.textContent = textContent; a.style.cursor = 'pointer'; a.style.display = 'inline-block'; a.style.color = 'var(--text-subdued)'; return a;
    }

    function setElementStyles(element, styles) {
        if (!styles) return;
        element.style.fontSize = styles.fontSize || '';
        element.style.fontWeight = styles.fontWeight || '';
        element.style.minWidth = '75px';
    }

    function createReleaseDateElement(separatorVal, formattedReleaseDate) {
        const releaseDateElement = createDivElement('releaseDate');
        releaseDateElement.style.display = 'inline-flex';
        releaseDateElement.style.alignItems = 'center';
        releaseDateElement.style.gap = '6px';

        if (separatorVal && separatorVal.trim() !== "") {
            const separatorElement = document.createElement("span");
            separatorElement.textContent = separatorVal;
            separatorElement.style.display = 'inline-block';
            separatorElement.style.lineHeight = '1';
            separatorElement.style.color = 'var(--text-subdued)';
            releaseDateElement.appendChild(separatorElement);
        }

        const dateElement = createAnchorElement(formattedReleaseDate);
        releaseDateElement.appendChild(dateElement);

        const targetedElement = document.querySelector((localStorage.getItem('position') || '') + ' a');
        if (targetedElement) {
            const targetedStyles = window.getComputedStyle(targetedElement);
            setElementStyles(releaseDateElement, targetedStyles);
        }

        let settingsMenu = document.getElementById('settingsMenu');
        if (!settingsMenu) createSettingsMenu();

        dateElement.addEventListener('click', function (event) {
            event.preventDefault();
            toggleSettingsMenu(dateElement, document.getElementById('settingsMenu'));
        });

        return releaseDateElement;
    }

    async function displayReleaseDate() {
        try {
            const { releaseDate, releaseDateString } = await getTrackDetailsRD();
            const formatted = formatDateForDisplay(releaseDate, releaseDateString);

            removeExistingReleaseDateElement();

            const userSelector = localStorage.getItem('position');
            log('trying to insert using user selector:', userSelector);

            const stop = observeForContainer(userSelector, (container, usedSelector) => {
                log('attaching release date to selector:', usedSelector);
                const releaseDateElement = createReleaseDateElement(localStorage.getItem('separator'), formatted);
                try {
                    container.appendChild(releaseDateElement);
                } catch (e) {
                    if (container.parentNode) container.parentNode.insertBefore(releaseDateElement, container.nextSibling);
                }
            }, 8000);

            setTimeout(() => { try { stop(); } catch (e) {} }, 8500);
        } catch (error) {
            console.error('[NPRD] Error displaying release date:', error);
        }
    }

    function removeExistingReleaseDateElement() {
        removeElementById('releaseDate');
        const existingGenresElement = document.querySelector(".main-trackInfo-genres");
        if (existingGenresElement) existingGenresElement.remove();
        hideElementById('settingsMenu');
    }

    function removeElementById(id) {
        const element = document.getElementById(id);
        if (element) element.remove();
    }

    function createSettingsMenu() {
        const existingSettingsMenu = document.getElementById('settingsMenu');
        if (existingSettingsMenu) {
            existingSettingsMenu.remove();
        }

        const settingsMenu = createDivElement('settingsMenu');

        const title = document.createElement('h2');
        title.textContent = 'NPRD Settings';
        settingsMenu.appendChild(title);

        const optionsDiv = document.createElement('div');
        optionsDiv.id = 'optionsDiv';

        const positionDropdown = createNativeDropdown("position", "Position", positions);
        optionsDiv.appendChild(positionDropdown);

        const dateFormatDropdown = createNativeDropdown("dateFormat", "Date Format", dateformat);
        optionsDiv.appendChild(dateFormatDropdown);

        const separatorDropdown = createNativeDropdown("separator", "Separator style", separator);
        optionsDiv.appendChild(separatorDropdown);

        settingsMenu.appendChild(optionsDiv);

        getTrackDetailsRD().then(({ album, releaseDateString }) => {
            if (!album) return;
            const albumLinkElement = document.createElement('a');
            albumLinkElement.href = album.external_urls?.spotify || '#';
            albumLinkElement.style.display = 'flex';
            albumLinkElement.style.gap = '1rem';
            albumLinkElement.style.marginTop = '0.5rem';
            albumLinkElement.style.alignItems = 'center';

            const albumImageElement = document.createElement('img');
            albumImageElement.src = (album.images && album.images[1] && album.images[1].url) || (album.images[0] && album.images[0].url) || '';
            albumImageElement.width = 64;
            albumImageElement.height = 64;
            albumImageElement.style.objectFit = 'cover';
            albumImageElement.style.borderRadius = '4px';

            const albumContainer = document.createElement('div');
            albumContainer.style.display = 'flex';
            albumContainer.style.flexDirection = 'column';
            albumContainer.style.gap = '4px';

            const albumNameElement = document.createElement('p');
            albumNameElement.textContent = `${album.name} - ${album.artists && album.artists[0] ? album.artists[0].name : ''}`;
            albumNameElement.style.margin = '0';

            const albumTypeElement = document.createElement('p');
            albumTypeElement.textContent = album.album_type || '';
            albumTypeElement.style.cssText = "text-transform: capitalize; margin: 0; color: var(--text-subdued); font-size: 0.9rem;";

            albumContainer.appendChild(albumNameElement);
            albumContainer.appendChild(albumTypeElement);
            albumLinkElement.appendChild(albumImageElement);
            albumLinkElement.appendChild(albumContainer);

            settingsMenu.appendChild(albumLinkElement);

            if (releaseDateString) {
                const rd = document.createElement('p');
                rd.textContent = `Parsed release date: ${releaseDateString}`;
                rd.style.margin = '6px 0 0 0';
                rd.style.color = 'var(--text-subdued)';
                settingsMenu.appendChild(rd);
            }
        }).catch(e => console.warn('Could not populate album info in settings menu:', e));

        document.body.appendChild(settingsMenu);
    }

    function createNativeDropdown(id, label, options) {
        const dropdownContainer = document.createElement("div");
        dropdownContainer.classList.add('Dropdown-container');

        const labelElement = document.createElement("label");
        labelElement.textContent = label;
        dropdownContainer.appendChild(labelElement);

        const selectElement = document.createElement("select");
        selectElement.id = id;
        selectElement.classList.add('releaseDateDropdown-control');

        options.forEach(option => {
            const optionElement = document.createElement("option");
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            if (localStorage.getItem(id) === option.value) {
                optionElement.selected = true;
            }
            selectElement.appendChild(optionElement);
        });

        selectElement.addEventListener('change', async function () {
            localStorage.setItem(id, selectElement.value);
            await displayReleaseDate();
        });

        dropdownContainer.appendChild(selectElement);

        return dropdownContainer;
    }

    function toggleSettingsMenu(dateElement, settingsMenu) {
        const rect = dateElement.getBoundingClientRect();

        settingsMenu.style.position = 'fixed';
        // place the menu above the clicked element where possible
        settingsMenu.style.left = `${Math.max(8, rect.left)}px`;
        settingsMenu.style.top = `${Math.max(8, rect.top - settingsMenu.offsetHeight - 8)}px`;

        // toggle display
        settingsMenu.style.display = settingsMenu.style.display === 'flex' ? 'none' : 'flex';

        // close when clicking outside
        document.removeEventListener('click', closeSettingsMenu);
        setTimeout(() => document.addEventListener('click', closeSettingsMenu), 0);

        function closeSettingsMenu(event) {
            if (!settingsMenu.contains(event.target) && event.target !== dateElement) {
                settingsMenu.style.display = 'none';
                document.removeEventListener('click', closeSettingsMenu);
            }
        }
    }

    function refreshSettingsMenu() {
        const settingsMenu = document.getElementById('settingsMenu');
        if (settingsMenu) {
            settingsMenu.remove();
        }
        createSettingsMenu();
    }

    async function initializeRD() {
        try {
            await waitForSpicetify();

            // add CSS early
            const existingStyle = document.getElementById('nprd-style');
            if (existingStyle) existingStyle.remove();

            document.head.appendChild(await releaseDateCSS());

            // song change handler
            let debounceTimer = null;
            const handler = async () => {
                removeExistingReleaseDateElement();
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    await displayReleaseDate();
                    refreshSettingsMenu();
                }, 200);
            };

            // ensure single registration
            if (state.songChangeHandler && Spicetify?.Player?.removeEventListener) {
                try { Spicetify.Player.removeEventListener('songchange', state.songChangeHandler); } catch (e) {}
                state.songChangeHandler = null;
            }
            state.songChangeHandler = handler;
            if (Spicetify?.Player?.addEventListener) Spicetify.Player.addEventListener('songchange', handler);

            hideElementById('settingsMenu');

            // initial attempt
            await displayReleaseDate();
            createSettingsMenu();
        } catch (error) {
            console.error('[NPRD] Error initializing: ', error);
        }
    }

    function hideElementById(id) {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    }

    function cleanup() {
        try {
            removeExistingReleaseDateElement();
            const st = document.getElementById('nprd-style');
            if (st) st.remove();
            const settings = document.getElementById('settingsMenu');
            if (settings) settings.remove();
            if (state.domObserver) { state.domObserver.disconnect(); state.domObserver = null; }
            if (state.songChangeHandler && Spicetify?.Player?.removeEventListener) {
                try { Spicetify.Player.removeEventListener('songchange', state.songChangeHandler); } catch (e) {}
                state.songChangeHandler = null;
            }
            state.initialized = false;
            log('cleaned up');
        } catch (e) {
            console.warn('[NPRD] cleanup error', e);
        }
    }

    // Kick off the script
    initializeRD();

    // Expose small helper to toggle debug from console without re-pasting:
    window.__NowPlayingReleaseDate.toggleDebug = function (val) {
        if (typeof val === 'boolean') {
            localStorage.setItem('nprd-debug', val ? 'true' : 'false');
            debugMode = val;
            window.__NPRD_debug = debugMode;
            console.log('[NPRD] debug set to', debugMode, '- re-paste the script to fully apply.');
        } else {
            console.log('[NPRD] current debug:', debugMode);
        }
    };

    // Inform user how to control debug quickly
    console.log('[NPRD] Pasteable script loaded. Toggle debug with localStorage.setItem("nprd-debug","true") then re-paste, or call window.__NowPlayingReleaseDate.toggleDebug(true).');
})();
