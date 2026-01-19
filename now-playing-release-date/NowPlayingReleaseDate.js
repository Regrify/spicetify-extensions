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
        #settingsMenu {
            display: none;
            position: absolute;
            background-color: var(--spice-main);
            padding: 16px;
            margin: 24px 0;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            flex-direction: column;
            min-width: 16vw;
            max-width: 20vw;
            z-index: 9999;
        }
        #settingsMenu h2 {
            padding: 10px;
            color: var(--spice-text);
            font-size: 1.2rem;
            border-bottom: 1px solid var(--spice-subtext);
        }
        #optionsDiv {
            display: flex;
            flex-direction: column;
            padding: 10px 0;
        }
        #settingsMenu a {
            display: flex;
            align-items: center;
            max-width: 100%;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: var(--spice-text);
            text-decoration: none;
        }
        #settingsMenu a:hover {
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
    `;
    return ReleaseDateStyle;
}

/**
 * Return an object { trackDetails, album, releaseDate (Date obj), releaseDateString, operatingSystem }
 * Robustly reads possible Spotify shapes (Player.data.item.*) then falls back to Cosmos.
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

    const positionDropdown = createNativeDropdown("position", "Position", positions);
    optionsDiv.appendChild(positionDropdown);

    const dateFormatDropdown = createNativeDropdown("dateFormat", "Date Format", dateformat);
    optionsDiv.appendChild(dateFormatDropdown);

    const separatorDropdown = createNativeDropdown("separator", "Separator style", separator);
    optionsDiv.appendChild(separatorDropdown);

    settingsMenu.appendChild(optionsDiv);

    getTrackDetailsRD().then(({ album }) => {
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
