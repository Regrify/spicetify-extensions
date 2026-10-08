console.log('[Now Playing Release Date] loaded');

(function () {

async function waitForSpicetify() {
    while (typeof Spicetify === 'undefined' || !Spicetify.showNotification || !Spicetify.Player || !Spicetify.Platform) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
async function waitForTrackData() {
    await waitForSpicetify();
    while (!Spicetify.Player.data || !Spicetify.Player.data.item) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
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
    { value: " ", text: "None" },
];

// Prefix storage keys so other extensions using 'position'/'dateFormat'/etc.
// don't overwrite ours (and vice versa).
const LS_PREFIX = 'nprd.';
function storageGet(key) {
    return localStorage.getItem(LS_PREFIX + key);
}
function storageSet(key, value) {
    localStorage.setItem(LS_PREFIX + key, value);
}

async function getTrackDetailsRD() {
    await waitForTrackData();

    if (!Spicetify.Player.data.item || !Spicetify.Player.data.item.uri) {
        throw new Error('No track data available');
    }

    const playerData = Spicetify.Player.data;
    if (!playerData || !playerData.item || !playerData.item.album || !playerData.item.album.uri) {
        throw new Error('No album URI available in player data');
    }

    const albumUri = playerData.item.album.uri;
    const albumId = albumUri.split(':')[2];

    async function fetchAlbumDetails() {
        const hexAlbumId = Spicetify.URI.idToHex(Spicetify.URI.from(albumUri).id);
        console.log('[NPRD] Trying internal album API with hex ID:', hexAlbumId);
        const albumResponse = await Spicetify.Platform.RequestBuilder.build()
            .withHost("https://spclient.wg.spotify.com/metadata/4")
            .withPath(`/album/${hexAlbumId}`)
            .send();
        return albumResponse.body;
    }

    let albumDetails;
    try {
        albumDetails = await fetchAlbumDetails();
        console.log('[NPRD] Internal album API response:', albumDetails);
    } catch (internalAlbumError) {
        if (internalAlbumError.message && internalAlbumError.message.includes('DUPLICATE_REQUEST_ERROR')) {
            console.log('[NPRD] Duplicate request detected, trying again after delay');
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
                albumDetails = await fetchAlbumDetails();
                console.log('[NPRD] Internal album API response (retry):', albumDetails);
            } catch (retryError) {
                console.log('[NPRD] Retry also failed, using player data with current date:', retryError);
                albumDetails = null;
            }
        } else {
            console.log('[NPRD] Internal album API failed, using player data with current date:', internalAlbumError);
            albumDetails = null;
        }
    }

    if (albumDetails && albumDetails.code === 429) {
        console.log('[NPRD] Album API rate limited (429), using player data with current date');
        albumDetails = null;
    }

    let album;
    let releaseDate;

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
            name: albumDetails.name || playerData.item.album.name,
            artists: albumDetails.artist || playerData.item.album.artists,
            album_type: albumDetails.type || 'album',
            gid: albumDetails.gid || albumId,
            external_urls: {
                spotify: albumDetails.canonical_uri || albumUri
            },
            images: normalizedImages.length > 0 ? normalizedImages : playerData.item.album.images
        };
        releaseDate = new Date(dateInfo.year, dateInfo.month - 1, dateInfo.day);
        console.log('[NPRD] Using release date from internal API:', releaseDate);
    } else {
        album = {
            name: playerData.item.album.name || 'Unknown Album',
            artists: playerData.item.album.artists ? playerData.item.album.artists.map(artist => ({ name: artist.name })) : [{ name: 'Unknown Artist' }],
            album_type: 'album',
            gid: playerData.item.album.uri ? playerData.item.album.uri.split(':')[2] : 'unknown',
            external_urls: {
                spotify: playerData.item.album.uri || ''
            },
            images: playerData.item.album.images || []
        };
        releaseDate = new Date();
        console.log('[NPRD] No release date available, using current date as fallback');
    }

    let operatingSystem = await Spicetify.Platform.operatingSystem;

    return {
        trackDetails: playerData.item,
        album,
        releaseDate,
        operatingSystem
    };
}

let releaseDateToken = 0;
let rdDomWatcherTimer;

window.operatingSystem = window.operatingSystem || null;
(async function () {
    await waitForSpicetify();
    if (window.operatingSystem == null) {
        try {
            window.operatingSystem = await Spicetify.Platform.operatingSystem;
        } catch (error) {
            console.error('[NPRD] Failed to get operating system:', error);
            window.operatingSystem = "Unknown";
        }
    }
})();

// Migrate settings stored under the old unprefixed keys.
for (const key of ['position', 'dateFormat', 'separator']) {
    if (storageGet(key) === null) {
        const legacy = localStorage.getItem(key);
        if (legacy !== null) storageSet(key, legacy);
    }
}

if (!storageGet('position')) {
    storageSet('position', positions[1].value);
    storageSet('dateFormat', dateformat[0].value);
    storageSet('separator', separator[0].value);
} else if (storageGet('position') != positions[0].value && storageGet('position') != positions[1].value) {
    storageSet('position', positions[1].value);
}

async function releaseDateCSS() {
    await waitForSpicetify();

    const ReleaseDateStyle = document.createElement('style');
    ReleaseDateStyle.innerHTML = `
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-nowPlayingWidget-trackInfo {
            min-width: 14rem;
        }
        #nprd-settingsMenu {
            display: none;
            position: absolute;
            overflow: hidden;
            background-color: var(--spice-main);
            padding: 16px;
            margin: 24px 0;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            flex-direction: column;
            min-width: 16vw;
            max-width: 20vw;
        }
        #nprd-settingsMenu h2 {
            padding: 10px;
            color: var(--spice-text);
            font-size: 1.2rem;
            border-bottom: 1px solid var(--spice-subtext);
        }
        #nprd-optionsDiv {
            display: flex;
            flex-direction: column;
            padding: 10px 0;
        }
        #nprd-settingsMenu a {
            display: flex;
            align-items: center;
            max-width: 100%;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: var(--spice-text);
            text-decoration: none;
        }
        #nprd-settingsMenu a:hover {
            color: var(--spice-text-bright-accent);
        }
        .Dropdown-container {
            overflow: visible; 
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
            gap: 10px;
        }
        .releaseDateDropdown-control {
            flex-grow: 1;
            display: inline;
            justify-content: space-between;
            border: 1px solid var(--spice-subtext);
            padding: 5px;
            cursor: pointer;
            min-width: fit-content;
            max-width: 10rem;
            background-color: var(--spice-main);
            color: var(--spice-text);
        }
        .Dropdown-optionsList {
            position: fixed;
            background-color: var(--spice-main);
            z-index: 1;
            border: 1px solid var(--spice-subtext);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .Dropdown-option {
            padding: 5px;
            cursor: pointer;
            color: var(--spice-text);
        }
        .Dropdown-option:hover {
            background-color: var(--spice-subtext);
        }
        
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists,
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name,
        #nprd-releaseDate {
            display: flex;
            gap: 3px;
            white-space: nowrap;
        }
        #nprd-releaseDate {
            display: contents;
            margin-right: 8px;
        }
        #nprd-releaseDate a, #nprd-releaseDate p {
            color: var(--text-subdued);
        }
    `;
    return ReleaseDateStyle;
}


(async function () {
    await initializeRD();
})();

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
                    refreshSettingsMenu();
                } catch (error) {
                    console.error('[NPRD] Error in songchange handler:', error);
                }
            }, 1);
        });

        // Re-inject the date if Spotify re-renders the widget and wipes it.
        const domWatcher = new MutationObserver(() => {
            if (!document.getElementById('nprd-releaseDate') && document.querySelector(storageGet('position'))) {
                clearTimeout(rdDomWatcherTimer);
                rdDomWatcherTimer = setTimeout(() => displayReleaseDate(), 150);
            }
        });
        domWatcher.observe(document.body, { childList: true, subtree: true });

        hideElementById('nprd-settingsMenu');

        if (window.operatingSystem === "Windows") {
            await Spicetify.Player.dispatchEvent(new Event('songchange'));
        } else {
            try {
                await displayReleaseDate();
            } catch (error) {
                console.error('[NPRD] Error in initial display:', error);
            }
        }

        document.head.appendChild(await releaseDateCSS());

        createSettingsMenu();
    } catch (error) {
        console.error('[NPRD] Error initializing: ', error, "\nCreate a new issue on the github repo to get this resolved");
    }
}

function hideElementById(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'none';
    }
}

async function displayReleaseDate() {
    try {
        const { releaseDate, trackDetails } = await getTrackDetailsRD();

        let formattedReleaseDate;

        switch (storageGet('dateFormat')) {
            case "DD-MM-YYYY":
                formattedReleaseDate = `${String(releaseDate.getDate()).padStart(2, '0')}-${String(releaseDate.getMonth() + 1).padStart(2, '0')}-${releaseDate.getFullYear()}`;
                break;
            case "MM-DD-YYYY":
                formattedReleaseDate = `${String(releaseDate.getMonth() + 1).padStart(2, '0')}-${String(releaseDate.getDate()).padStart(2, '0')}-${releaseDate.getFullYear()}`;
                break;
            case "YYYY-MM-DD":
                formattedReleaseDate = `${releaseDate.getFullYear()}-${String(releaseDate.getMonth() + 1).padStart(2, '0')}-${String(releaseDate.getDate()).padStart(2, '0')}`;
                break;
            default:
                formattedReleaseDate = releaseDate;
        }

        removeExistingReleaseDateElement();
        const token = ++releaseDateToken;

        setTimeout(() => {
            if (token !== releaseDateToken) return; // superseded by a newer call

            const releaseDateElement = createReleaseDateElement(storageGet('separator') || '•', formattedReleaseDate);
            const selector = storageGet('position');
            console.log('[NPRD] Looking for selector:', selector);
            const container = selector ? document.querySelector(selector) : null;

            if (container) {
                container.appendChild(releaseDateElement);
            } else {
                console.error('[NPRD] Failed to find container for selector:', selector);
                const fallbackSelectors = [
                    '.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name',
                    '.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists',
                    '.main-trackInfo-name',
                    '.main-trackInfo-container [class*="name"]',
                ];

                for (const fallbackSelector of fallbackSelectors) {
                    const fallbackContainer = document.querySelector(fallbackSelector);
                    if (fallbackContainer) {
                        console.log('[NPRD] Found fallback container:', fallbackSelector);
                        fallbackContainer.appendChild(releaseDateElement);
                        return;
                    }
                }
                console.error('[NPRD] All fallback selectors failed');
            }
        }, 50);
    } catch (error) {
        console.error('[NPRD] Error displaying release date:', error);
    }
}

function removeExistingReleaseDateElement() {
    removeElementById('nprd-releaseDate');
    hideElementById('nprd-settingsMenu');
}

function removeElementById(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function createReleaseDateElement(separator, formattedReleaseDate) {
    const releaseDateElement = createDivElement('nprd-releaseDate');

    if (separator && separator.trim() !== "") {
        const separatorElement = document.createElement("p");
        separatorElement.textContent = separator;
        releaseDateElement.appendChild(separatorElement);
    }

    const dateElement = createAnchorElement(formattedReleaseDate);
    releaseDateElement.appendChild(dateElement);

    const position = storageGet('position');
    const targetedElement = position ? document.querySelector(position + ' a') : null;
    if (targetedElement) {
        const targetedStyles = window.getComputedStyle(targetedElement);
        setElementStyles(releaseDateElement, targetedStyles);
    }

    if (!document.getElementById('nprd-settingsMenu')) {
        createSettingsMenu();
    }

    dateElement.addEventListener('click', function (event) {
        event.preventDefault();
        toggleSettingsMenu(dateElement);
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
    return anchorElement;
}

function setElementStyles(element, styles) {
    element.style.fontSize = styles.fontSize;
    element.style.fontWeight = styles.fontWeight;
    element.style.minWidth = "75px";
}

function createSettingsMenu() {
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

    const dateFormatDropdown = createNativeDropdown("dateFormat", "Date Format", dateformat);
    optionsDiv.appendChild(dateFormatDropdown);

    const separatorDropdown = createNativeDropdown("separator", "Separator style", separator);
    optionsDiv.appendChild(separatorDropdown);

    settingsMenu.appendChild(optionsDiv);

    getTrackDetailsRD().then(({ album }) => {
        const albumLinkElement = document.createElement('a');
        albumLinkElement.href = album.external_urls.spotify;

        let albumImage;
        if (album.images && album.images.length > 0) {
            const smallImage = album.images.find(img => img.size === 'SMALL') || album.images[0];
            if (smallImage) {
                albumImage = document.createElement('img');
                albumImage.src = smallImage.url;
                albumImage.width = 50;
                albumImage.height = 50;
                albumImage.style.marginRight = '1rem';
                albumImage.style.borderRadius = '4px';
                albumImage.style.objectFit = 'cover';
            }
        }

        const albumNameElement = document.createElement('p');
        albumNameElement.textContent = `${album.name} - ${Array.isArray(album.artists) ? album.artists[0].name : (album.artists?.name || 'Unknown Artist')} \n`;

        const albumTypeElement = document.createElement('p');
        albumTypeElement.textContent = album.album_type;
        albumTypeElement.style.cssText = "text-transform: capitalize;";

        const albumContainer = document.createElement('div');

        albumContainer.appendChild(albumNameElement);
        albumContainer.appendChild(albumTypeElement);

        if (albumImage) {
            albumLinkElement.appendChild(albumImage);
        }
        albumLinkElement.appendChild(albumContainer);

        settingsMenu.appendChild(albumLinkElement);
    }).catch(error => {
        console.error('[NPRD] Error loading album in settings menu:', error);
        const fallbackElement = document.createElement('p');
        fallbackElement.textContent = 'Album information unavailable';
        fallbackElement.style.color = 'var(--spice-subtext)';
        settingsMenu.appendChild(fallbackElement);
    });

    document.body.appendChild(settingsMenu);
}

function createNativeDropdown(id, label, options) {
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
        optionElement.textContent = option.text;
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

function toggleSettingsMenu(dateElement) {
    const settingsMenu = document.getElementById('nprd-settingsMenu');
    if (!settingsMenu) return;

    const rect = dateElement.getBoundingClientRect();

    settingsMenu.style.position = 'absolute';
    settingsMenu.style.left = `${rect.left}px`;
    settingsMenu.style.bottom = `${window.innerHeight - rect.top}px`;

    if (settingsMenu.style.display === '') {
        settingsMenu.style.display = 'flex';
    } else {
        settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'flex' : 'none';
    }

    document.removeEventListener('click', closeSettingsMenu);

    document.addEventListener('click', closeSettingsMenu);

    function closeSettingsMenu(event) {
        if (!settingsMenu.contains(event.target) && event.target !== dateElement) {
            settingsMenu.style.display = 'none';
            document.removeEventListener('click', closeSettingsMenu);
        }
    }
}

function refreshSettingsMenu() {
    const settingsMenu = document.getElementById('nprd-settingsMenu');
    if (settingsMenu) {
        settingsMenu.remove();
    }
    createSettingsMenu();
}

})();
