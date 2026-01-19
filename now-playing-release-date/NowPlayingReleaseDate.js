console.log('[Now Playing Release Date] loaded');

async function waitForSpicetify() {
    while (typeof Spicetify === "undefined" || !Spicetify || !Spicetify.showNotification) {
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
    if (typeof spotifyId !== "string") {
        return INVALID;
    }
    if (spotifyId.length === 0 || spotifyId.length > 22) {
        return INVALID;
    }
    const characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let decimalValue = BigInt(0);
    for (let i = 0; i < spotifyId.length; i++) {
        const index = characters.indexOf(spotifyId[i]);
        if (index === -1) {
            return INVALID;
        }
        decimalValue = decimalValue * BigInt(62) + BigInt(index);
    }
    const hexValue = decimalValue.toString(16).padStart(32, "0");
    if (hexValue.length > 32) {
        return INVALID;
    }
    return hexValue;
}

window.operatingSystem = window.operatingSystem || null;

(async function () {
    await waitForTrackData();
    if (window.operatingSystem == null) {
        let details = await getTrackDetailsRD();
        window.operatingSystem = details.operatingSystem || null;
    }
})();

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
]

if (!localStorage.getItem('position')) {
    localStorage.setItem('position', positions[1].value);
    localStorage.setItem('dateFormat', dateformat[0].value);
    localStorage.setItem('separator', separator[0].value);
} else if (localStorage.getItem('position') != positions[0].value && localStorage.getItem('position') != positions[1].value) {
    // Fallback for the position setting if it's not found in the positions array
    localStorage.setItem('position', positions[1].value);
}

async function releaseDateCSS() {
    await waitForSpicetify();

    const ReleaseDateStyle = document.createElement('style');
    ReleaseDateStyle.innerHTML = `
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-nowPlayingWidget-trackInfo {
            min-width: 14rem;
        }

        /* Improved settings menu UI */
        #settingsMenu {
            display: none;
            position: fixed;
            background-color: var(--spice-main);
            padding: 12px;
            border-radius: 10px;
            box-shadow: 0 10px 24px rgba(0,0,0,0.6);
            z-index: 2147483647;
            min-width: 260px;
            max-width: 34vw;
            max-height: 60vh;
            overflow: auto;
            border: 1px solid rgba(255,255,255,0.04);
            color: var(--spice-text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;
            font-size: 13px;
        }
        #settingsMenu h2 {
            margin: 0 0 8px 0;
            padding-bottom: 8px;
            color: var(--spice-text);
            font-size: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        #optionsDiv {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding-top: 8px;
        }
        .Dropdown-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
        }
        .Dropdown-label {
            flex: 1 1 auto;
            color: var(--spice-text);
            font-size: 13px;
            min-width: 90px;
        }
        .releaseDateDropdown-control {
            flex: 0 0 140px;
            padding: 6px 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.06);
            background-color: var(--spice-surface);
            color: var(--spice-text);
            font-size: 13px;
        }
        .settings-row {
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:8px;
        }
        .settings-actions {
            margin-top: 10px;
            display:flex;
            gap:8px;
        }
        .settings-actions button {
            padding:8px 10px;
            border-radius:6px;
            cursor:pointer;
            border: none;
            background: var(--spice-accent);
            color: var(--spice-text);
            font-weight:600;
        }
        .settings-actions .secondary {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.06);
            color: var(--spice-text);
            font-weight:500;
        }

        /* Ensure the release date and separator are inline and vertically centered */
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists,
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name,
        #releaseDate {
            display: flex;
            gap: 6px;
            white-space: nowrap;
            align-items: center;
        }
        #releaseDate {
            margin-right: 8px;
            align-items: center;
        }
        #releaseDate a, #releaseDate span {
            color: var(--text-subdued);
            cursor: pointer;
            display: inline-block;
        }
        .main-trackInfo-genres {
            grid-area: genres;
            display: block !important;
            min-height: 20px;
            width: 100%;
        }
        .main-nowPlayingWidget-trackInfo .main-trackInfo-container {
            display: grid;
            grid-template-areas:
                "title"
                "subtitle"
                "genres" !important;
            grid-template-rows: auto auto auto;
        }

        /* Diagnostics panel tweaks */
        #nprd-diag-panel pre { white-space: pre-wrap; word-break: break-word; }
    `;
    return ReleaseDateStyle;
}

/**
 * Return an object { trackDetails, album, releaseDate (Date obj), releaseDateString, operatingSystem }
 * Robustly reads possible Spotify shapes (Player.data.item.*) then falls back to Cosmos, then MusicBrainz.
 */
async function getTrackDetailsRD() {
    await waitForTrackData();

    const item = Spicetify.Player?.data?.item;
    let trackDetails = null;
    let album = null;
    let releaseDate = null;
    let releaseDateString = '';

    // Try to extract from Player.data.item (preferred)
    if (item) {
        try {
            const albumFromItem = item.album || item.album_urn || item.albumMetadata || null;

            // release date variants in different Spotify versions
            const possibleReleaseDate = albumFromItem?.release_date || albumFromItem?.releaseDate || albumFromItem?.date || item?.release_date || item?.date;
            if (possibleReleaseDate) {
                if (typeof possibleReleaseDate === 'string') {
                    // formats: YYYY, YYYY-MM, YYYY-MM-DD
                    const parts = possibleReleaseDate.split("-");
                    const year = parseInt(parts[0], 10) || 1970;
                    const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
                    const day = parts[2] ? parseInt(parts[2], 10) : 1;
                    releaseDate = new Date(year, month, day);
                    releaseDateString = possibleReleaseDate.length === 4
                        ? `${year}-01-01`
                        : possibleReleaseDate.length === 7
                            ? `${year}-${String(month + 1).padStart(2, '0')}-01`
                            : possibleReleaseDate;
                } else if (typeof possibleReleaseDate === 'object' && (possibleReleaseDate.year || possibleReleaseDate.month)) {
                    releaseDate = new Date(possibleReleaseDate.year, (possibleReleaseDate.month || 1) - 1, possibleReleaseDate.day || 1);
                    releaseDateString = `${possibleReleaseDate.year}-${String(possibleReleaseDate.month || 1).padStart(2, '0')}-${String(possibleReleaseDate.day || 1).padStart(2, '0')}`;
                }
            }

            if (albumFromItem) {
                const artists = albumFromItem.artists || albumFromItem.artist || item.artists || item.artist || [];
                const images = albumFromItem.images?.length ? albumFromItem.images :
                    (albumFromItem.cover_group?.image?.length ? albumFromItem.cover_group.image : []);
                album = {
                    name: albumFromItem.name || albumFromItem.title || '',
                    artists: Array.isArray(artists) ? artists.map(a => ({ name: a.name || a })) : [{ name: artists.name || artists }],
                    album_type: albumFromItem.album_type || 'album',
                    gid: albumFromItem.gid || albumFromItem.id || '',
                    external_urls: {
                        spotify: albumFromItem.external_urls?.spotify || item?.external_urls?.spotify || ''
                    },
                    images: (images || []).map(img => {
                        if (img.url && img.url.startsWith('http')) return { url: img.url, width: img.width || 64, height: img.height || 64 };
                        if (img.file_id) return { url: `https://i.scdn.co/image/${img.file_id}`, width: img.width || 64, height: img.height || 64 };
                        return { url: img, width: 64, height: 64 };
                    })
                };
            }
        } catch (e) {
            console.warn('Error parsing Player.item album data; will try Cosmos fallback', e);
        }
    }

    // Cosmos fallback (defensive)
    if ((!releaseDate || !album) && item?.uri) {
        try {
            const trackId = item.uri.split(":")[2];
            if (trackId) {
                const hexId = spotifyHex(trackId);
                trackDetails = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/metadata/4/track/${hexId}?market=from_token`);
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
                            releaseDateString = dateObj.length === 4 ? `${year}-01-01` : (dateObj.length === 7 ? `${year}-${String(month + 1).padStart(2, '0')}-01` : dateObj);
                        } else {
                            releaseDate = new Date(dateObj.year, (dateObj.month || 1) - 1, dateObj.day || 1);
                            releaseDateString = `${dateObj.year}-${String(dateObj.month || 1).padStart(2, '0')}-${String(dateObj.day || 1).padStart(2, '0')}`;
                        }
                    }

                    const artists = alb.artist || alb.artists || [];
                    const coverImages = (alb.cover_group && alb.cover_group.image) ? alb.cover_group.image : (alb.images || []);

                    album = {
                        name: alb.name || '',
                        artists: Array.isArray(artists) ? artists.map(a => ({ name: a.name || a })) : [{ name: artists.name || artists }],
                        album_type: alb.album_type || 'album',
                        gid: alb.gid || alb.id || '',
                        external_urls: {
                            spotify: `spotify:album:${alb.gid || alb.id || ''}`
                        },
                        images: (coverImages || []).map(img => {
                            if (img.file_id) return { url: `https://i.scdn.co/image/${img.file_id}`, width: img.width || 64, height: img.height || 64 };
                            if (img.url) return { url: img.url, width: img.width || 64, height: img.height || 64 };
                            return { url: img, width: 64, height: 64 };
                        })
                    };
                }
            }
        } catch (e) {
            console.warn('Cosmos fallback failed:', e);
        }
    }

    // MUSICBRAINZ FALLBACK: if we still don't have releaseDateString, try MusicBrainz by album + artist
    async function fetchMusicBrainzReleaseDate(albumName, artistName) {
        try {
            if (!albumName) return { ok: false, reason: 'no-album-name' };
            const q = `release:"${albumName.replace(/"/g, '')}"` + (artistName ? ` AND artist:"${artistName.replace(/"/g, '')}"` : '');
            const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(q)}&fmt=json&limit=3`;
            const resp = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'NowPlayingReleaseDate/1.0 (spicetify extension)' }});
            if (!resp.ok) return { ok: false, status: resp.status, statusText: resp.statusText };
            const data = await resp.json();
            const releases = data.releases || [];
            // prefer exact title match and first with a date
            for (const r of releases) {
                if (r.date) return { ok: true, date: r.date, release: r };
            }
            return { ok: false, reason: 'no-date-found' };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    }

    // Final minimal fallback to use Player.item.album raw if we still don't have a nice album object
    if (!album && item?.album) {
        album = {
            name: item.album.name || '',
            artists: (item.album.artists || []).map(a => ({ name: a.name || a })),
            album_type: item.album.album_type || 'album',
            gid: item.album.gid || '',
            external_urls: { spotify: item.album.external_urls?.spotify || '' },
            images: (item.album.images || []).map(img => ({ url: img.url, width: img.width, height: img.height }))
        };
    }

    // If we have a date object but no string, normalize to string
    if (!releaseDateString && releaseDate instanceof Date && !isNaN(releaseDate)) {
        releaseDateString = `${releaseDate.getFullYear()}-${String(releaseDate.getMonth() + 1).padStart(2, '0')}-${String(releaseDate.getDate()).padStart(2, '0')}`;
    }

    // If still empty, try some alternative fields
    if (!releaseDateString && item?.album?.release_date) {
        const r = item.album.release_date;
        if (typeof r === 'string') {
            releaseDateString = r.length === 4 ? `${r}-01-01` : r;
        }
    }

    // If still no releaseDateString, attempt MusicBrainz last
    if (!releaseDateString && album && album.name) {
        try {
            const artistName = (album.artists && album.artists[0] && (album.artists[0].name || album.artists[0])) || null;
            const mb = await fetchMusicBrainzReleaseDate(album.name, artistName);
            if (mb && mb.ok && mb.date) {
                const d = mb.date;
                if (/^\d{4}$/.test(d)) {
                    releaseDateString = `${d}-01-01`;
                    releaseDate = new Date(parseInt(d, 10), 0, 1);
                } else if (/^\d{4}-\d{2}$/.test(d)) {
                    const [y, m] = d.split('-');
                    releaseDateString = `${y}-${m}-01`;
                    releaseDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
                } else {
                    releaseDateString = d;
                    const parts = d.split('-').map(p => parseInt(p, 10));
                    releaseDate = new Date(parts[0] || 1970, (parts[1] ? parts[1] - 1 : 0), parts[2] || 1);
                }
                // If MusicBrainz returned release metadata, enrich album.external_urls if missing
                if (mb.release && !album.external_urls?.spotify && mb.release.id) {
                    album.external_urls = album.external_urls || {};
                    album.external_urls.spotify = `https://open.spotify.com/album/${album.gid || mb.release.id}`;
                }
            }
        } catch (e) {
            console.warn('MusicBrainz lookup failed:', e);
        }
    }

    let operatingSystem = (Spicetify.Platform && Spicetify.Platform.operatingSystem) ? Spicetify.Platform.operatingSystem : null;

    return { trackDetails, album, releaseDate, releaseDateString, operatingSystem };
}

(async function () {
    await initializeRD();
})();

async function initializeRD() {
    try {
        await waitForSpicetify();

        let debounceTimer;

        Spicetify.Player.addEventListener("songchange", async () => {
            removeExistingReleaseDateElement();
            if (!debounceTimer) {
                debounceTimer = setTimeout(async () => {
                    await displayReleaseDate();
                    refreshSettingsMenu();
                    debounceTimer = null;
                }, 50);
            }
        });

        hideElementById('settingsMenu');

        // Initial display
        await displayReleaseDate();

        document.head.appendChild(await releaseDateCSS());

        createSettingsMenu();
    } catch (error) {
        console.error('Error initializing: ', error, "\nCreate a new issue on the github repo to get this resolved");
    }
}

function hideElementById(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'none';
    }
}

function findContainer(selector) {
    // Try the configured selector first
    if (!selector) return null;
    let el = document.querySelector(selector);
    if (el) return el;

    // Known fallbacks (cover multiple spotify DOM versions)
    const fallbacks = [
        '.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists',
        '.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name',
        '.main-nowPlayingWidget-trackInfo .main-trackInfo-container',
        '[data-testid="now-playing-widget"] .main-trackInfo-name',
        '.now-playing .track-info__name',
        '.Root__now-playing-bar'
    ];
    for (const f of fallbacks) {
        el = document.querySelector(f);
        if (el) return el;
    }
    return null;
}

async function displayReleaseDate() {
    try {
        const { releaseDate, releaseDateString, trackDetails } = await getTrackDetailsRD();

        let formattedReleaseDate;

        const dateToFormat = releaseDate instanceof Date && !isNaN(releaseDate) ? releaseDate : null;

        switch (localStorage.getItem('dateFormat')) {
            case "DD-MM-YYYY":
                if (dateToFormat) formattedReleaseDate = `${String(dateToFormat.getDate()).padStart(2, '0')}-${String(dateToFormat.getMonth() + 1).padStart(2, '0')}-${dateToFormat.getFullYear()}`;
                else formattedReleaseDate = releaseDateString || 'Unknown';
                break;
            case "MM-DD-YYYY":
                if (dateToFormat) formattedReleaseDate = `${String(dateToFormat.getMonth() + 1).padStart(2, '0')}-${String(dateToFormat.getDate()).padStart(2, '0')}-${dateToFormat.getFullYear()}`;
                else formattedReleaseDate = releaseDateString || 'Unknown';
                break;
            case "YYYY-MM-DD":
                if (dateToFormat) formattedReleaseDate = `${dateToFormat.getFullYear()}-${String(dateToFormat.getMonth() + 1).padStart(2, '0')}-${String(dateToFormat.getDate()).padStart(2, '0')}`;
                else formattedReleaseDate = releaseDateString || 'Unknown';
                break;
            default:
                formattedReleaseDate = releaseDateString || 'Unknown';
        }

        removeExistingReleaseDateElement();

        const currentPosition = localStorage.getItem('position');
        console.log('Current position:', currentPosition);

        // If user wants to inject into a container that no longer exists, this will search for fallbacks
        setTimeout(() => {
            const releaseDateElement = createReleaseDateElement(localStorage.getItem('separator'), formattedReleaseDate);
            const container = findContainer(currentPosition);
            if (container) {
                container.appendChild(releaseDateElement);
                console.log('Release date element appended to:', container.className || container.tagName);
            } else {
                console.warn('Could not find a container to append the release date. Current selector:', currentPosition);
                // show diagnostics panel so user can copy details without devtools
                const diag = { time: new Date().toISOString(), item: Spicetify.Player?.data?.item || null, note: 'no container found' };
                showDiagnosticsPanel(diag);
            }
        }, 100);
    } catch (error) {
        console.error('Error displaying release date:', error);
    }
}

function removeExistingReleaseDateElement() {
    removeElementById('releaseDate');
    const existingGenresElement = document.querySelector(".main-trackInfo-genres");
    if (existingGenresElement) {
        existingGenresElement.remove();
    }
    hideElementById('settingsMenu');
}

function removeElementById(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function createReleaseDateElement(separator, formattedReleaseDate) {
    const releaseDateElement = createDivElement('releaseDate');
    releaseDateElement.style.display = 'inline-flex';
    releaseDateElement.style.alignItems = 'center';
    releaseDateElement.style.gap = '6px';

    if (separator && separator.trim() !== "") {
        // use span (inline) instead of p so it doesn't force a line break (fixes the dot on its own line)
        const separatorElement = document.createElement("span");
        separatorElement.textContent = separator;
        separatorElement.style.display = 'inline-block';
        separatorElement.style.lineHeight = '1';
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
    if (!settingsMenu) {
        createSettingsMenu();
        settingsMenu = document.getElementById('settingsMenu');
    }

    dateElement.addEventListener('click', function (event) {
        event.preventDefault();
        toggleSettingsMenu(dateElement, settingsMenu);
    });

    return releaseDateElement;
}

function createDivElement(id) {
    const divElement = document.createElement("div");
    divElement.id = id;
    return divElement;
}

function createAnchorElement(textContent) {
    const anchorElement = document.createElement("a");
    anchorElement.textContent = textContent;
    anchorElement.style.cursor = 'pointer';
    anchorElement.style.display = 'inline-block';
    return anchorElement;
}

function setElementStyles(element, styles) {
    if (!styles) return;
    element.style.fontSize = styles.fontSize || '';
    element.style.fontWeight = styles.fontWeight || '';
    element.style.minWidth = "75px";
}

function createSettingsMenu() {
    const existingSettingsMenu = document.getElementById('settingsMenu');
    if (existingSettingsMenu) {
        existingSettingsMenu.remove();
    }

    const settingsMenu = createDivElement('settingsMenu');

    const title = document.createElement("h2");
    title.textContent = 'NPRD Settings';
    settingsMenu.appendChild(title);

    const optionsDiv = document.createElement("div");
    optionsDiv.id = 'optionsDiv';

    // better-styled rows
    const posRow = createDropdownRow("position", "Position", positions);
    const fmtRow = createDropdownRow("dateFormat", "Date format", dateformat);
    const sepRow = createDropdownRow("separator", "Separator", separator);

    optionsDiv.appendChild(posRow);
    optionsDiv.appendChild(fmtRow);
    optionsDiv.appendChild(sepRow);

    // Debug toggle row
    const debugRow = document.createElement('div');
    debugRow.classList.add('settings-row');
    const debugLabel = document.createElement('div');
    debugLabel.className = 'Dropdown-label';
    debugLabel.textContent = 'Debug logs';
    const debugControl = document.createElement('input');
    debugControl.type = 'checkbox';
    debugControl.id = 'nprd-debug';
    debugControl.checked = localStorage.getItem('nprd-debug') === 'true';
    debugControl.addEventListener('change', (e) => { localStorage.setItem('nprd-debug', e.target.checked ? 'true' : 'false'); });
    debugRow.appendChild(debugLabel);
    debugRow.appendChild(debugControl);

    optionsDiv.appendChild(debugRow);

    // Album info (populated asynchronously)
    getTrackDetailsRD().then(({ album }) => {
        if (!album) return;
        const albumLinkElement = document.createElement('a');
        albumLinkElement.href = album.external_urls?.spotify || '#';
        albumLinkElement.style.display = 'flex';
        albumLinkElement.style.gap = '1rem';
        albumLinkElement.style.marginTop = '0.5rem';
        albumLinkElement.style.alignItems = 'center';
        albumLinkElement.style.textDecoration = 'none';
        albumLinkElement.style.color = 'var(--spice-text)';

        const albumImageElement = document.createElement('img');
        albumImageElement.src = (album.images && album.images[1] && album.images[1].url) || (album.images[0] && album.images[0].url) || '';
        albumImageElement.width = 56;
        albumImageElement.height = 56;
        albumImageElement.style.objectFit = 'cover';
        albumImageElement.style.borderRadius = '6px';
        albumImageElement.style.flex = '0 0 auto';

        const albumContainer = document.createElement('div');
        albumContainer.style.display = 'flex';
        albumContainer.style.flexDirection = 'column';
        albumContainer.style.gap = '4px';
        albumContainer.style.flex = '1 1 auto';

        const albumNameElement = document.createElement('div');
        albumNameElement.textContent = `${album.name} ${album.artists && album.artists[0] ? '— ' + album.artists[0].name : ''}`;
        albumNameElement.style.margin = '0';
        albumNameElement.style.fontWeight = '600';
        albumNameElement.style.fontSize = '13px';
        albumNameElement.style.color = 'var(--spice-text)';

        const albumTypeElement = document.createElement('div');
        albumTypeElement.textContent = album.album_type || '';
        albumTypeElement.style.cssText = "text-transform: capitalize; margin: 0; color: var(--text-subdued); font-size: 12px;";

        albumContainer.appendChild(albumNameElement);
        albumContainer.appendChild(albumTypeElement);
        albumLinkElement.appendChild(albumImageElement);
        albumLinkElement.appendChild(albumContainer);

        settingsMenu.appendChild(albumLinkElement);
    }).catch(e => console.warn('Could not populate album info in settings menu:', e));

    // actions
    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'secondary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => settingsMenu.style.display = 'none');
    const runNow = document.createElement('button');
    runNow.textContent = 'Run now';
    runNow.addEventListener('click', async () => {
        settingsMenu.style.display = 'none';
        const res = await displayReleaseDate();
    });
    actions.appendChild(closeBtn);
    actions.appendChild(runNow);

    settingsMenu.appendChild(optionsDiv);
    settingsMenu.appendChild(actions);

    document.body.appendChild(settingsMenu);

    // Close when pressing Escape
    settingsMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') settingsMenu.style.display = 'none'; });

    // helper: update selects to saved values
    const posSel = document.getElementById('position');
    if (posSel) posSel.value = localStorage.getItem('position') || positions[1].value;
    const fmtSel = document.getElementById('dateFormat');
    if (fmtSel) fmtSel.value = localStorage.getItem('dateFormat') || dateformat[0].value;
    const sepSel = document.getElementById('separator');
    if (sepSel) sepSel.value = localStorage.getItem('separator') || separator[0].value;
}

function createDropdownRow(id, labelText, options) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const label = document.createElement('div');
    label.className = 'Dropdown-label';
    label.textContent = labelText;
    const control = document.createElement('select');
    control.id = id;
    control.className = 'releaseDateDropdown-control';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.text;
        control.appendChild(o);
    });
    // set initial value from localStorage
    const saved = localStorage.getItem(id);
    if (saved) control.value = saved;
    control.addEventListener('change', async () => {
        localStorage.setItem(id, control.value);
        await displayReleaseDate();
    });
    row.appendChild(label);
    row.appendChild(control);
    return row;
}

function toggleSettingsMenu(dateElement, settingsMenu) {
    // Make sure menu exists and is in the document
    if (!settingsMenu || !dateElement) return;

    // show it to measure (visibility hidden to avoid flicker)
    settingsMenu.style.display = 'block';
    settingsMenu.style.visibility = 'hidden';

    // measure
    const rect = dateElement.getBoundingClientRect();
    const menuRect = settingsMenu.getBoundingClientRect();
    const margin = 8;

    // default prefer above the clicked element
    let left = rect.left;
    let top = rect.top - menuRect.height - 8;

    // if not enough space above, place below
    if (top < margin) {
        top = rect.bottom + 8;
    }

    // ensure menu stays within viewport horizontally
    if (left + menuRect.width + margin > window.innerWidth) {
        left = Math.max(margin, window.innerWidth - menuRect.width - margin);
    }
    if (left < margin) left = margin;

    // ensure menu stays within viewport vertically
    if (top + menuRect.height + margin > window.innerHeight) {
        top = Math.max(margin, window.innerHeight - menuRect.height - margin);
    }

    // apply position
    settingsMenu.style.left = `${left}px`;
    settingsMenu.style.top = `${top}px`;
    settingsMenu.style.visibility = 'visible';

    // toggle display state: if it was visible, hide it
    if (settingsMenu.style.display === 'block' && settingsMenu.getAttribute('data-open') === 'true') {
        settingsMenu.style.display = 'none';
        settingsMenu.setAttribute('data-open', 'false');
        return;
    }
    settingsMenu.style.display = 'block';
    settingsMenu.setAttribute('data-open', 'true');

    // close when clicking outside
    function closeOnOutside(e) {
        if (!settingsMenu.contains(e.target) && e.target !== dateElement) {
            settingsMenu.style.display = 'none';
            settingsMenu.setAttribute('data-open', 'false');
            document.removeEventListener('click', closeOnOutside);
        }
    }
    document.removeEventListener('click', closeOnOutside);
    setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
}

function refreshSettingsMenu() {
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsMenu) {
        settingsMenu.remove();
    }
    createSettingsMenu();
}

// Diagnostics centered panel (used when insertion fails)
function showDiagnosticsPanel(diag) {
    document.getElementById('nprd-diag-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'nprd-diag-panel';
    panel.style.position = 'fixed';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%,-50%)';
    panel.style.zIndex = 2147483647;
    panel.style.minWidth = '480px';
    panel.style.maxWidth = '96vw';
    panel.style.background = 'rgba(6,6,6,0.95)';
    panel.style.color = '#eaeaea';
    panel.style.padding = '12px';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 16px 48px rgba(0,0,0,0.6)';
    panel.style.fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>NowPlayingReleaseDate — Diagnostics</strong>
        <div style="display:flex;gap:8px">
          <button id="nprd-diag-hide" style="padding:6px;border-radius:6px;background:transparent;border:1px solid rgba(255,255,255,0.06);color:#ddd;cursor:pointer">Hide</button>
        </div>
      </div>
      <p style="margin:8px 0 12px 0;color:#cfcfcf;font-size:13px">If the release date is missing, click "Copy diagnostics" and paste the JSON to the extension author.</p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <button id="nprd-diag-copy" style="flex:1;padding:12px;border-radius:8px;background:#1db954;color:#071;cursor:pointer;border:none;font-weight:700">Copy diagnostics</button>
        <button id="nprd-diag-close" style="padding:10px;border-radius:8px;background:#222;color:#fff;border:1px solid rgba(255,255,255,0.06);cursor:pointer">Close</button>
      </div>
      <pre id="nprd-diag-pre" style="background:rgba(255,255,255,0.02);padding:8px;border-radius:6px;max-height:48vh;overflow:auto;color:#ddd">${JSON.stringify(diag || {}, null, 2)}</pre>
    `;
    document.body.appendChild(panel);
    document.getElementById('nprd-diag-hide').addEventListener('click', () => panel.style.display = 'none');
    document.getElementById('nprd-diag-close').addEventListener('click', () => panel.remove());
    document.getElementById('nprd-diag-copy').addEventListener('click', async () => {
      const txt = JSON.stringify(diag || {}, null, 2);
      try { await navigator.clipboard.writeText(txt); const b = document.getElementById('nprd-diag-copy'); b.textContent = 'Copied ✓'; setTimeout(()=>b.textContent='Copy diagnostics', 1200); } catch (e) { prompt('Diagnostics', txt); }
    });
}
