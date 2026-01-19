// NowPlayingReleaseDate — single pasteable script
// Paste the entire contents of this file into the Spotify/Spicetify console and it will run immediately.
// Toggle debug by setting localStorage.setItem('nprd-debug', 'true') before pasting, or toggle in the settings UI.
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
            #settingsMenu { display:none; position:absolute; background:var(--spice-main); padding:12px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.3); min-width:220px; z-index:9999; }
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
                    const imagesRaw = albumFromItem.images?.length ? albumFromItem.images : (albumFromItem.cover_group?.image || []);
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
                images: (item.album.images || []).map(img => ({ url: img.url || (img.file_id ? `https://i.scdn.co/image/${img.file_id}` : img), width: img.width, height: img.height }))
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

    function observeForContainer(targetSelector, onFound, timeout = 8000) {
        const immediate = findContainer(targetSelector);
        if (immediate.el) {
            log('found container immediately using', immediate.usedSelector);
            onFound(immediate.el, immediate.usedSelector);
            return () => {};
        }
        if (state.domObserver) state.domObserver.disconnect();
        state.domObserver = new MutationObserver(() => {
            const found = findContainer(targetSelector);
            if (found.el) {
                log('found container via MutationObserver using', found.usedSelector);
                state.domObserver.disconnect();
                state.domObserver = null;
                onFound(found.el, found.usedSelector);
            }
        });
        state.domObserver.observe(document.body, { childList: true, subtree: true });
        // stop after timeout
        const stop = () => { if (state.domObserver) { state.domObserver.disconnect(); state.domObserver = null; } };
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
            const sep = document.createElement('span');
            sep.textContent = separatorVal;
            sep.style.display = 'inline-block';
            sep.style.lineHeight = '1';
            sep.style.color = 'var(--text-subdued)';
            releaseDateElement.appendChild(sep);
        }

        const dateEl = createAnchorElement(formattedReleaseDate);
        releaseDateElement.appendChild(dateEl);

        const targetedElement = document.querySelector((localStorage.getItem('position') || '') + ' a');
        if (targetedElement) {
            const targetedStyles = window.getComputedStyle(targetedElement);
            setElementStyles(releaseDateElement, targetedStyles);
        }

        // create settings menu if not present (we append outside this function)
        let settingsMenu = document.getElementById('settingsMenu');
        if (!settingsMenu) createSettingsMenu();

        dateEl.addEventListener('click', function (e) {
            e.preventDefault();
            toggleSettingsMenu(dateEl, document.getElementById('settingsMenu'));
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

            // ensure observer removed after time (already handled), stop function returned if needed
            setTimeout(() => { try { stop(); } catch (e) {} }, 8500);
        } catch (e) {
            console.error('[NPRD] Error displaying release date:', e);
        }
    }

    function removeExistingReleaseDateElement() {
        const el = document.getElementById('releaseDate');
        if (el) el.remove();
        const existingGenres = document.querySelector('.main-trackInfo-genres');
        if (existingGenres) existingGenres.remove();
        const menu = document.getElementById('settingsMenu');
        if (menu) menu.style.display = 'none';
    }

    function createSettingsMenu() {
        const existing = document.getElementById('settingsMenu');
        if (existing) existing.remove();

        const settingsMenu = createDivElement('settingsMenu');

        const title = document.createElement('h2');
        title.textContent = 'NPRD Settings';
        settingsMenu.appendChild(title);

        const optionsDiv = document.createElement('div');
        optionsDiv.id = 'optionsDiv';

        optionsDiv.appendChild(createNativeDropdown("position", "Position", positions));
        optionsDiv.appendChild(createNativeDropdown("dateFormat", "Date Format", dateformat));
        optionsDiv.appendChild(createNativeDropdown("separator", "Separator style", separator));

        // Debug toggle (UI toggles localStorage and runtime variable)
        const debugDiv = document.createElement('div');
        debugDiv.style.marginTop = '8px';
        debugDiv.innerHTML = `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="nprd-debug-ui"> Debug logs</label>`;
        optionsDiv.appendChild(debugDiv);

        settingsMenu.appendChild(optionsDiv);
        document.body.appendChild(settingsMenu);

        const debugCheckbox = document.getElementById('nprd-debug-ui');
        if (debugCheckbox) {
            debugCheckbox.checked = debugMode;
            debugCheckbox.addEventListener('change', (e) => {
                const val = e.target.checked ? 'true' : 'false';
                localStorage.setItem('nprd-debug', val);
                debugMode = val === 'true';
                window.__NPRD_debug = debugMode;
                console.log('[NPRD] Debug set to', debugMode, '- re-paste the script to fully reinitialize with new debug state.');
            });
        }

        // Populate current track album info and parsed date for convenience
        getTrackDetailsRD().then(({ album, releaseDateString }) => {
            if (!album) return;
            try {
                const albumLink = document.createElement('a');
                albumLink.href = album.external_urls?.spotify || '#';
                albumLink.style.display = 'flex';
                albumLink.style.gap = '1rem';
                albumLink.style.marginTop = '0.5rem';
                albumLink.style.alignItems = 'center';

                const img = document.createElement('img');
                img.src = (album.images && album.images[1] && album.images[1].url) || (album.images && album.images[0] && album.images[0].url) || '';
                img.width = 64; img.height = 64; img.style.objectFit = 'cover'; img.style.borderRadius = '4px';

                const info = document.createElement('div');
                info.style.display = 'flex'; info.style.flexDirection = 'column'; info.style.gap = '4px';

                const name = document.createElement('p'); name.textContent = `${album.name} - ${album.artists && album.artists[0] ? album.artists[0].name : ''}`; name.style.margin = '0';
                const type = document.createElement('p'); type.textContent = album.album_type || ''; type.style.cssText = 'text-transform:capitalize;margin:0;color:var(--text-subdued);font-size:0.9rem;';

                info.appendChild(name); info.appendChild(type);
                albumLink.appendChild(img); albumLink.appendChild(info);
                settingsMenu.appendChild(albumLink);

                if (releaseDateString) {
                    const rd = document.createElement('p'); rd.textContent = `Parsed release date: ${releaseDateString}`; rd.style.margin = '6px 0 0 0'; rd.style.color = 'var(--text-subdued)';
                    settingsMenu.appendChild(rd);
                }
            } catch (e) { log('could not populate settings album UI', e); }
        }).catch(e => log('could not get track details for settings menu', e));
    }

    function createNativeDropdown(id, label, options) {
        const container = document.createElement('div');
        container.classList.add('Dropdown-container');
        container.style.marginTop = '6px';

        const labelEl = document.createElement('label'); labelEl.textContent = label;
        container.appendChild(labelEl);

        const select = document.createElement('select'); select.id = id; select.classList.add('releaseDateDropdown-control');
        options.forEach(opt => {
            const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.text;
            if (localStorage.getItem(id) === opt.value) o.selected = true;
            select.appendChild(o);
        });
        select.addEventListener('change', async () => {
            localStorage.setItem(id, select.value);
            await displayReleaseDate();
        });
        container.appendChild(select);
        return container;
    }

    function toggleSettingsMenu(dateElement, settingsMenu) {
        const rect = dateElement.getBoundingClientRect();
        settingsMenu.style.position = 'fixed';
        settingsMenu.style.left = `${Math.max(8, rect.left)}px`;
        const topCandidate = rect.top - settingsMenu.offsetHeight - 8;
        const bottomCandidate = rect.bottom + 8;
        settingsMenu.style.top = `${topCandidate > 8 ? topCandidate : bottomCandidate}px`;
        settingsMenu.style.display = settingsMenu.style.display === 'flex' ? 'none' : 'flex';

        document.removeEventListener('click', closeSettingsMenu);
        setTimeout(() => document.addEventListener('click', closeSettingsMenu), 0);

        function closeSettingsMenu(event) {
            if (!settingsMenu.contains(event.target) && event.target !== dateElement) {
                settingsMenu.style.display = 'none';
                document.removeEventListener('click', closeSettingsMenu);
            }
        }
    }

    async function initializeRD() {
        try {
            await waitForSpicetify();
            // Attach CSS
            const existingStyle = document.getElementById('nprd-style');
            if (existingStyle) existingStyle.remove();
            document.head.appendChild(await releaseDateCSS());

            // Ensure single songchange handler
            if (state.songChangeHandler && Spicetify?.Player?.removeEventListener) {
                try { Spicetify.Player.removeEventListener('songchange', state.songChangeHandler); } catch (e) {}
                state.songChangeHandler = null;
            }

            state.songChangeHandler = async () => {
                removeExistingReleaseDateElement();
                // small debounce to allow Spotify to update DOM
                setTimeout(async () => {
                    await displayReleaseDate();
                    refreshSettingsMenu();
                }, 200);
            };

            if (Spicetify?.Player?.addEventListener) Spicetify.Player.addEventListener('songchange', state.songChangeHandler);

            // initial run
            await displayReleaseDate();
            createSettingsMenu();
            state.initialized = true;
            log('initialized');
        } catch (e) {
            console.error('[NPRD] initialize error:', e);
        }
    }

    function refreshSettingsMenu() {
        const s = document.getElementById('settingsMenu');
        if (s) s.remove();
        createSettingsMenu();
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
