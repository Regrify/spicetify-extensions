console.log('[Now Playing Release Date] loaded');

(function () {

const positions = Object.freeze([
    { value: ".main-nowPlayingWidget-nowPlaying .main-trackInfo-artists", text: "Artist" },
    { value: ".main-nowPlayingWidget-nowPlaying .main-trackInfo-name", text: "Song name" },
    { value: ".main-nowPlayingWidget-nowPlaying .main-nowPlayingWidget-trackInfo > *:last-child", text: "Lossless badge" },
]);

const dateformat = Object.freeze([
    { value: "DD-MM-YYYY", text: "Day-Month-Year" },
    { value: "MM-DD-YYYY", text: "Month-Day-Year" },
    { value: "YYYY-MM-DD", text: "Year-Month-Day" }
]);

const dateseparator = Object.freeze([
    { value: "-", text: "Dash (-)" },
    { value: "/", text: "Slash (/)" },
    { value: ".", text: "Dot (.)" },
    { value: " ", text: "Space" },
    { value: "", text: "None" }
]);

const separator = Object.freeze([
    { value: "•", text: "Dot (•)" },
    { value: "*", text: "Star (*)" },
    { value: "-", text: "Dash (-)" },
    { value: "/", text: "Slash (/)" },
    { value: "|", text: "Pipe (|)" },
    { value: "()", text: "Parentheses ()" },
    { value: "[]", text: "Brackets []" },
    { value: "{}", text: "Braces {}" },
    { value: "<>", text: "Angle Brackets <>" },
    { value: " ", text: "Space" },
    { value: "", text: "None" }
]);

const LS_PREFIX = 'nprd.';
function storageGet(key) {
    return localStorage.getItem(LS_PREFIX + key);
}
function storageSet(key, value) {
    localStorage.setItem(LS_PREFIX + key, value);
}

for (const key of ['position', 'dateFormat', 'separator', 'dateSeparator']) {
    if (storageGet(key) === null) {
        const legacy = localStorage.getItem(key);
        if (legacy !== null) storageSet(key, legacy);
    }
}

if (!storageGet('position')) {
    storageSet('position', positions[1].value);
    storageSet('dateFormat', dateformat[0].value);
    storageSet('dateSeparator', dateseparator[0].value);
    storageSet('separator', separator[0].value);
} else if (!positions.some(p => p.value === storageGet('position'))) {
    storageSet('position', positions[1].value);
}

if (!storageGet('dateSeparator')) {
    storageSet('dateSeparator', dateseparator[0].value);
}

const albumCache = new Map();
const albumInFlight = new Map();
const trackCache = new Map();
const CACHE_MAX = 100;

function cacheTrack(trackId, data) {
    if (trackCache.size >= CACHE_MAX) {
        const firstKey = trackCache.keys().next().value;
        if (firstKey) trackCache.delete(firstKey);
    }
    trackCache.set(trackId, data);
}

async function waitUntil(predicate, opts = {}) {
    const { initial = 50, max = 500, timeout = 15000 } = opts;
    let delay = initial;
    const start = Date.now();
    if (predicate()) return;
    while (!predicate()) {
        if (Date.now() - start > timeout) throw new Error('waitUntil timeout');
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(max, Math.floor(delay * 1.5));
    }
}

async function waitForSpicetify() {
    await waitUntil(() => typeof Spicetify !== 'undefined' && Spicetify?.showNotification && Spicetify?.Player && Spicetify?.Platform);
}

async function waitForTrackData() {
    await waitForSpicetify();
    await waitUntil(() => {
        const item = Spicetify?.Player?.data?.item;
        if (!item) return false;
        if (!item.uri?.includes(':track:')) return true;
        return !!item.album?.uri;
    });
}

async function fetchAlbumDetails(albumUri) {
    if (!albumUri) return null;
    let hexAlbumId;
    try {
        const uriObj = Spicetify.URI?.from?.(albumUri);
        if (!uriObj || !uriObj.id) return null;
        hexAlbumId = Spicetify.URI.idToHex(uriObj.id);
    } catch (e) {
        console.error('[NPRD] Invalid album URI:', albumUri, e);
        return null;
    }

    if (albumCache.has(hexAlbumId)) {
        return albumCache.get(hexAlbumId);
    }

    if (albumInFlight.has(hexAlbumId)) {
        return albumInFlight.get(hexAlbumId);
    }

    const fetchPromise = (async () => {
        const executeFetch = async () => {
            const rb = Spicetify.Platform?.RequestBuilder?.build?.();
            if (!rb) return null;
            const albumResponse = await rb
                .withHost("https://spclient.wg.spotify.com/metadata/4")
                .withPath(`/album/${hexAlbumId}`)
                .send();
            return albumResponse.body;
        };

        let albumDetails = null;
        let retries = 2;
        while (retries >= 0) {
            try {
                albumDetails = await executeFetch();
                if (albumDetails) break;
            } catch (err) {
                if (err.message && err.message.includes('DUPLICATE_REQUEST_ERROR') && retries > 0) {
                    await new Promise(r => setTimeout(r, 100));
                } else {
                    console.error('[NPRD] Internal album API failed:', err);
                    albumDetails = null;
                    break;
                }
            }
            retries--;
        }

        if (albumDetails && albumDetails.code === 429) {
            console.error('[NPRD] Album API rate limited (429)');
            albumDetails = null;
        }

        if (albumDetails && albumDetails.date) {
            albumCache.set(hexAlbumId, albumDetails);
        }

        return albumDetails;
    })();

    albumInFlight.set(hexAlbumId, fetchPromise);

    try {
        return await fetchPromise;
    } finally {
        albumInFlight.delete(hexAlbumId);
    }
}

async function getTrackDetailsRD() {
    await waitForTrackData();

    const playerData = Spicetify.Player.data;
    if (!playerData || !playerData.item || !playerData.item.uri) {
        throw new Error('No track data available');
    }

    const trackUri = playerData.item.uri;
    const trackId = trackUri.split(':')[2];

    if (trackId && trackCache.has(trackId)) {
        return trackCache.get(trackId);
    }

    const albumUri = playerData.item.album?.uri;
    const albumId = albumUri ? albumUri.split(':')[2] : 'unknown';

    const albumDetails = albumUri ? await fetchAlbumDetails(albumUri) : null;

    let album;
    let releaseDate = null;

    if (albumDetails && albumDetails.date) {
        const dateInfo = albumDetails.date;

        let normalizedImages = [];
        if (albumDetails.cover_group && albumDetails.cover_group.image) {
            normalizedImages = albumDetails.cover_group.image.map(img => ({
                url: `https://i.scdn.co/image/${img.file_id}`,
                width: img.width,
                height: img.height
            }));
        }

        album = {
            name: albumDetails.name || playerData.item.album?.name || 'Unknown Album',
            artists: albumDetails.artist || playerData.item.album?.artists || [{ name: 'Unknown Artist' }],
            album_type: albumDetails.type || 'album',
            gid: albumDetails.gid || albumId,
            external_urls: {
                spotify: albumDetails.canonical_uri || albumUri || ''
            },
            images: normalizedImages.length > 0 ? normalizedImages : (playerData.item.album?.images || [])
        };

        const year = dateInfo.year;
        const month = (dateInfo.month || 1) - 1;
        const day = dateInfo.day || 1;
        if (year !== undefined && year !== null) {
            releaseDate = new Date(year, month, day);
        }
    } else {
        album = {
            name: playerData.item.album?.name || 'Unknown Album',
            artists: playerData.item.album?.artists ? playerData.item.album.artists.map(artist => ({ name: artist.name })) : [{ name: 'Unknown Artist' }],
            album_type: 'album',
            gid: albumId,
            external_urls: {
                spotify: albumUri || ''
            },
            images: playerData.item.album?.images || []
        };

        const metaYear = playerData.item?.metadata?.year || playerData.item?.metadata?.album_year;
        if (metaYear) {
            releaseDate = new Date(parseInt(metaYear, 10), 0, 1);
        } else if (playerData.item?.album?.release_date) {
            releaseDate = new Date(playerData.item.album.release_date);
        }
    }

    const result = {
        trackDetails: playerData.item,
        album,
        releaseDate
    };

    if (trackId) {
        cacheTrack(trackId, result);
    }

    return result;
}

function formatReleaseDate(releaseDate, formatPattern, dateSep) {
    if (!(releaseDate instanceof Date) || isNaN(releaseDate.getTime())) return null;

    const pad = (n) => String(n).padStart(2, '0');
    const year = String(releaseDate.getFullYear());
    const month = pad(releaseDate.getMonth() + 1);
    const day = pad(releaseDate.getDate());

    const sep = dateSep !== undefined && dateSep !== null ? dateSep : (storageGet('dateSeparator') ?? '-');

    const orderMap = {
        "DD-MM-YYYY": [day, month, year],
        "MM-DD-YYYY": [month, day, year],
        "YYYY-MM-DD": [year, month, day]
    };

    const tokens = orderMap[formatPattern] || [day, month, year];
    return tokens.join(sep);
}

function createDivElement(id) {
    const divElement = document.createElement("div");
    if (id) divElement.id = id;
    return divElement;
}

function createAnchorElement(textContent) {
    const anchorElement = document.createElement("a");
    anchorElement.textContent = textContent;
    anchorElement.style.cursor = 'pointer';
    anchorElement.setAttribute('role', 'button');
    anchorElement.setAttribute('tabindex', '0');
    return anchorElement;
}

function removeElementById(id) {
    const element = document.getElementById(id);
    if (element) element.remove();
}

function hideElementById(id) {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
}

function setElementStyles(element, styles) {
    if (styles.fontSize) element.style.fontSize = styles.fontSize;
    if (styles.fontWeight) element.style.fontWeight = styles.fontWeight;
}

async function releaseDateCSS() {
    await waitForSpicetify();

    const ReleaseDateStyle = document.createElement('style');
    ReleaseDateStyle.id = 'nprd';
    ReleaseDateStyle.innerHTML = `
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-nowPlayingWidget-trackInfo {
            min-width: 14rem;
        }

        .main-nowPlayingWidget-nowPlaying .main-nowPlayingWidget-trackInfo > *:last-child {
            display: flex;
            font-size: var(--encore-text-size-smaller-2);
        }
        #nprd-settingsMenu {
            display: none;
            position: fixed;
            overflow: hidden;
            background-color: var(--spice-main);
            padding: 16px;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            flex-direction: column;
            min-width: 240px;
            max-width: 320px;
            z-index: 10001;
            border: 1px solid var(--spice-subtext);
            font-family: var(--font-family, sans-serif);
        }
        #nprd-settingsMenu h2 {
            padding: 0 0 10px 0;
            margin: 0;
            color: var(--spice-text);
            font-size: 1.1rem;
            border-bottom: 1px solid var(--spice-subtext);
        }
        #nprd-optionsDiv {
            display: flex;
            flex-direction: column;
            padding: 10px 0;
        }
        #nprd-albumInfoContainer {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--spice-subtext);
        }
        #nprd-albumInfoContainer a {
            display: flex;
            align-items: center;
            max-width: 100%;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: var(--spice-text);
            text-decoration: none;
        }
        #nprd-albumInfoContainer a:hover {
            color: var(--spice-button-active, var(--spice-text-bright-accent));
        }
        .Dropdown-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            gap: 10px;
        }
        .Dropdown-container label {
            color: var(--spice-text);
            font-size: 0.85rem;
            font-weight: 500;
        }
        .releaseDateDropdown-control {
            flex-grow: 1;
            display: inline-block;
            border: 1px solid var(--spice-subtext);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            max-width: 10rem;
            background-color: var(--spice-main);
            color: var(--spice-text);
            font-size: 0.85rem;
        }
        
        .main-nowPlayingWidget-nowPlaying .main-trackInfo-artists,
        .main-nowPlayingWidget-nowPlaying .main-trackInfo-name {
            display: inline-flex;
            align-items: baseline;
            gap: 4px;
            white-space: nowrap;
        }
        #nprd-releaseDate {
            display: inline-flex;
            align-items: baseline;
            gap: 4px;
            white-space: nowrap;
            margin: 0;
            padding: 0;
        }
        #nprd-releaseDate a, #nprd-releaseDate p {
            color: var(--text-subdued, var(--spice-subtext));
            margin: 0 !important;
            padding: 0 !important;
            font-size: inherit;
            line-height: inherit;
            vertical-align: baseline;
        }
        #nprd-releaseDate p {
            user-select: none;
        }
        #nprd-releaseDate a:hover {
            color: var(--spice-text);
            text-decoration: underline;
        }
    `;
    return ReleaseDateStyle;
}

function createReleaseDateElement(separatorText, formattedReleaseDate, album, releaseDate) {
    const releaseDateElement = createDivElement('nprd-releaseDate');

    const bracketsMap = {
        "()": ["(", ")"],
        "[]": ["[", "]"],
        "{}": ["{", "}"],
        "<>": ["<", ">"]
    };

    let displayText = formattedReleaseDate;

    if (bracketsMap[separatorText]) {
        const [open, close] = bracketsMap[separatorText];
        displayText = `${open}${formattedReleaseDate}${close}`;
    } else if (separatorText !== undefined && separatorText !== null && separatorText !== "") {
        const separatorElement = document.createElement("p");
        separatorElement.textContent = separatorText;
        releaseDateElement.appendChild(separatorElement);
    }

    const dateElement = createAnchorElement(displayText);
    releaseDateElement.appendChild(dateElement);

    const position = storageGet('position');
    const targetedElement = position ? document.querySelector(position + ' a') : null;
    if (targetedElement) {
        const targetedStyles = window.getComputedStyle(targetedElement);
        setElementStyles(releaseDateElement, targetedStyles);
    }

    const handleInteraction = (event) => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        toggleSettingsMenu(dateElement, album, releaseDate);
    };

    dateElement.addEventListener('click', handleInteraction);
    dateElement.addEventListener('keydown', handleInteraction);

    return releaseDateElement;
}

function createNativeDropdown(id, label, options, releaseDate = null) {
    const dropdownContainer = document.createElement("div");
    dropdownContainer.classList.add('Dropdown-container');

    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    dropdownContainer.appendChild(labelElement);

    const selectElement = document.createElement("select");
    selectElement.id = 'nprd-' + id;
    selectElement.classList.add('releaseDateDropdown-control');

    options.forEach(option => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;

        if (id === 'dateFormat' && releaseDate) {
            const preview = formatReleaseDate(releaseDate, option.value);
            optionElement.textContent = preview || option.text;
        } else {
            optionElement.textContent = option.text;
        }

        if (storageGet(id) === option.value) {
            optionElement.selected = true;
        }
        selectElement.appendChild(optionElement);
    });

    selectElement.addEventListener('change', async function () {
        storageSet(id, selectElement.value);
        await displayReleaseDate();
    });

    dropdownContainer.appendChild(selectElement);
    return dropdownContainer;
}

function populateAlbumInfo(container, album) {
    if (!album) return;
    container.innerHTML = '';

    const albumLinkElement = document.createElement('a');
    albumLinkElement.href = album.external_urls?.spotify || '#';
    albumLinkElement.target = '_blank';

    let albumImage;
    if (album.images && album.images.length > 0) {
        const smallImage = album.images.find(img => img.size === 'SMALL') || album.images[0];
        if (smallImage?.url) {
            albumImage = document.createElement('img');
            albumImage.src = smallImage.url;
            albumImage.width = 40;
            albumImage.height = 40;
            albumImage.style.marginRight = '0.75rem';
            albumImage.style.borderRadius = '4px';
            albumImage.style.objectFit = 'cover';
        }
    }

    const artistName = Array.isArray(album.artists)
        ? album.artists.map(a => a.name || 'Unknown').join(', ')
        : (album.artists?.name || 'Unknown Artist');

    const albumNameElement = document.createElement('p');
    albumNameElement.textContent = `${album.name || 'Unknown Album'} - ${artistName}`;
    albumNameElement.style.margin = '0';
    albumNameElement.style.fontWeight = 'bold';
    albumNameElement.style.fontSize = '0.85rem';

    const albumTypeElement = document.createElement('p');
    albumTypeElement.textContent = album.album_type || 'album';
    albumTypeElement.style.cssText = "text-transform: capitalize; margin: 0; opacity: 0.7; font-size: 0.75rem;";

    const textContainer = document.createElement('div');
    textContainer.style.overflow = 'hidden';
    textContainer.appendChild(albumNameElement);
    textContainer.appendChild(albumTypeElement);

    if (albumImage) {
        albumLinkElement.appendChild(albumImage);
    }
    albumLinkElement.appendChild(textContainer);

    container.appendChild(albumLinkElement);
}

function updateSettingsMenuInfo(album, releaseDate) {
    const albumContainer = document.getElementById('nprd-albumInfoContainer');
    if (albumContainer && album) {
        populateAlbumInfo(albumContainer, album);
    }
    if (releaseDate) {
        const dateFormatSelect = document.getElementById('nprd-dateFormat');
        if (dateFormatSelect) {
            dateformat.forEach((option, index) => {
                const optEl = dateFormatSelect.options[index];
                if (optEl) {
                    const preview = formatReleaseDate(releaseDate, option.value);
                    optEl.textContent = preview || option.text;
                }
            });
        }
    }
}

function createSettingsMenu(album, releaseDate) {
    const existingSettingsMenu = document.getElementById('nprd-settingsMenu');
    if (existingSettingsMenu) {
        existingSettingsMenu.remove();
    }

    const settingsMenu = createDivElement('nprd-settingsMenu');

    const title = document.createElement("h2");
    title.textContent = 'NPRD Settings';
    settingsMenu.appendChild(title);

    const optionsDiv = document.createElement("div");
    optionsDiv.id = 'nprd-optionsDiv';

    const positionDropdown = createNativeDropdown("position", "Position", positions);
    optionsDiv.appendChild(positionDropdown);

    const dateFormatDropdown = createNativeDropdown("dateFormat", "Date Order", dateformat, releaseDate);
    optionsDiv.appendChild(dateFormatDropdown);

    const dateSepDropdown = createNativeDropdown("dateSeparator", "Date Separator", dateseparator);
    optionsDiv.appendChild(dateSepDropdown);

    const separatorDropdown = createNativeDropdown("separator", "Widget Separator", separator);
    optionsDiv.appendChild(separatorDropdown);

    settingsMenu.appendChild(optionsDiv);

    const albumInfoContainer = createDivElement('nprd-albumInfoContainer');
    settingsMenu.appendChild(albumInfoContainer);

    if (album) {
        populateAlbumInfo(albumInfoContainer, album);
    } else {
        getTrackDetailsRD().then(({ album: fetchedAlbum, releaseDate: fetchedDate }) => {
            populateAlbumInfo(albumInfoContainer, fetchedAlbum);
            updateSettingsMenuInfo(fetchedAlbum, fetchedDate);
        }).catch(error => {
            console.error('[NPRD] Error loading album in settings menu:', error);
            albumInfoContainer.textContent = 'Album information unavailable';
            albumInfoContainer.style.color = 'var(--spice-subtext)';
        });
    }

    document.body.appendChild(settingsMenu);
    return settingsMenu;
}

function toggleSettingsMenu(dateElement, album, releaseDate) {
    let settingsMenu = document.getElementById('nprd-settingsMenu');
    if (!settingsMenu) {
        settingsMenu = createSettingsMenu(album, releaseDate);
    } else {
        updateSettingsMenuInfo(album, releaseDate);
    }

    const isVisible = settingsMenu.style.display === 'flex';

    if (isVisible) {
        settingsMenu.style.display = 'none';
    } else {
        const rect = dateElement.getBoundingClientRect();
        const left = Math.max(10, Math.min(rect.left, window.innerWidth - 300));
        const bottom = Math.max(10, window.innerHeight - rect.top + 8);

        settingsMenu.style.position = 'fixed';
        settingsMenu.style.left = `${left}px`;
        settingsMenu.style.bottom = `${bottom}px`;
        settingsMenu.style.top = 'auto';
        settingsMenu.style.zIndex = '10001';
        settingsMenu.style.display = 'flex';

        const closeSettingsMenu = (event) => {
            if (event.type === 'keydown' && event.key === 'Escape') {
                settingsMenu.style.display = 'none';
                cleanupListeners();
            } else if (event.type === 'click' && !settingsMenu.contains(event.target) && !dateElement.contains(event.target)) {
                settingsMenu.style.display = 'none';
                cleanupListeners();
            }
        };

        const cleanupListeners = () => {
            document.removeEventListener('click', closeSettingsMenu);
            document.removeEventListener('keydown', closeSettingsMenu);
        };

        setTimeout(() => {
            document.addEventListener('click', closeSettingsMenu);
            document.addEventListener('keydown', closeSettingsMenu);
        }, 10);
    }
}

let releaseDateToken = 0;
let rdDomWatcherTimer;
let isDisplaying = false;

function removeExistingReleaseDateElement() {
    removeElementById('nprd-releaseDate');
    hideElementById('nprd-settingsMenu');
}

async function displayReleaseDate() {
    if (isDisplaying) return;
    isDisplaying = true;
    const token = ++releaseDateToken;

    try {
        const { releaseDate, album } = await getTrackDetailsRD();
        if (token !== releaseDateToken) return;

        removeExistingReleaseDateElement();

        const formattedReleaseDate = formatReleaseDate(releaseDate, storageGet('dateFormat'), storageGet('dateSeparator'));
        if (!formattedReleaseDate) {
            console.warn('[NPRD] No valid release date to display');
            return;
        }

        const releaseDateElement = createReleaseDateElement(storageGet('separator') ?? '•', formattedReleaseDate, album, releaseDate);
        const selector = storageGet('position');
        const container = selector ? document.querySelector(selector) : null;

        if (container) {
            container.appendChild(releaseDateElement);
        } else {
            console.warn('[NPRD] Failed to find container for selector:', selector);
            const fallbackSelectors = [
                '.main-nowPlayingWidget-nowPlaying .main-trackInfo-name',
                '.main-nowPlayingWidget-nowPlaying .main-trackInfo-artists',
                '.main-trackInfo-name',
                '.main-trackInfo-container [class*="name"]',
            ];

            for (const fallbackSelector of fallbackSelectors) {
                const fallbackContainer = document.querySelector(fallbackSelector);
                if (fallbackContainer) {
                    fallbackContainer.appendChild(releaseDateElement);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('[NPRD] Error displaying release date:', error);
    } finally {
        isDisplaying = false;
    }
}

async function initializeRD() {
    try {
        await waitForSpicetify();

        let debounceTimer;

        Spicetify.Player.addEventListener("songchange", () => {
            removeExistingReleaseDateElement();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    await displayReleaseDate();
                } catch (error) {
                    console.error('[NPRD] Error in songchange handler:', error);
                }
            }, 50);
        });

        const needsReleaseDate = () => {
            if (document.getElementById('nprd-releaseDate')) return false;
            const primary = storageGet('position');
            if (primary && document.querySelector(primary)) return true;
            const fallbacks = [
                '.main-nowPlayingWidget-nowPlaying .main-trackInfo-name',
                '.main-nowPlayingWidget-nowPlaying .main-trackInfo-artists',
                '.main-trackInfo-name',
                '.main-trackInfo-container [class*="name"]',
            ];
            return fallbacks.some(sel => document.querySelector(sel));
        };
        const domWatcher = new MutationObserver(() => {
            if (needsReleaseDate() && !isDisplaying) {
                clearTimeout(rdDomWatcherTimer);
                rdDomWatcherTimer = setTimeout(() => {
                    if (needsReleaseDate() && !isDisplaying) displayReleaseDate();
                }, 200);
            }
        });

        const targetContainer = document.querySelector('.main-nowPlayingWidget-nowPlaying') ||
                                document.querySelector('.main-nowPlayingBar-left') ||
                                document.body;
        domWatcher.observe(targetContainer, { childList: true, subtree: true });

        hideElementById('nprd-settingsMenu');

        if (!document.getElementById('nprd')) {
            document.head.appendChild(await releaseDateCSS());
        }

        await displayReleaseDate();
    } catch (error) {
        console.error('[NPRD] Error initializing:', error);
    }
}

(async function () {
    await initializeRD();
})();

})();
