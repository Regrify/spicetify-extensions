console.log('[Now Playing Release Date] loaded');

async function waitForSpicetify() {
    while (!Spicetify || !Spicetify.showNotification) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
async function waitForTrackData() {
    while (!Spicetify.Player.data || !Spicetify.Player.data.item) {
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
    const characters =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
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
        window.operatingSystem = details.operatingSystem;
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
    { value: "‎", text: "None" },
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
        
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-artists,
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-name,
        #releaseDate {
            display: flex;
            gap: 3px;
            white-space: nowrap;
        }
        #releaseDate {
            display: contents;
            margin-right: 8px;
        }
        #releaseDate a, #releaseDate p {
            color: var(--text-subdued);
        }
        .main-trackInfo-genres {
            grid-area: genres;
            display: block !important;
            min-height: 20px;
            width: 100%;
            background-color: rgba(255, 0, 0, 0.1); /* Temporary debug styling */
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

async function getTrackDetailsRD() {
    await waitForTrackData();
    let trackId = Spicetify.Player.data.item.uri.split(":")[2];
    const hexId = spotifyHex(trackId);
    const trackDetails = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/metadata/4/track/${hexId}?market=from_token`);
    console.log('New API response:', trackDetails);

    let album = {
        name: trackDetails.album.name,
        artists: trackDetails.album.artist.map(artist => ({ name: artist.name })),
        album_type: 'album',
        gid: trackDetails.album.gid,
        external_urls: {
            spotify: `spotify:album:${trackDetails.album.gid}`
        },
        images: trackDetails.album.cover_group.image.map(img => ({
            url: `https://i.scdn.co/image/${img.file_id}`,
            width: img.width,
            height: img.height
        }))
    };

    const dateObj = trackDetails.album.date;
    const releaseDate = new Date(dateObj.year, dateObj.month - 1, dateObj.day || 1);
    album.release_date = `${dateObj.year}-${String(dateObj.month).padStart(2, '0')}-${String(dateObj.day || 1).padStart(2, '0')}`;

    let operatingSystem = await Spicetify.Platform.operatingSystem;
    return { trackDetails, album, releaseDate, operatingSystem };
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
                }, 1);
            }
        });

        hideElementById('settingsMenu');

        if (window.operatingSystem === "Windows") {
            await Spicetify.Player.dispatchEvent(new Event('songchange'));
        } else {
            await displayReleaseDate();
        }

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

async function displayReleaseDate() {
    try {
        const { releaseDate, trackDetails } = await getTrackDetailsRD();

        let formattedReleaseDate;

        switch (localStorage.getItem('dateFormat')) {
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

        const currentPosition = localStorage.getItem('position');
        console.log('Current position:', currentPosition);

        if (currentPosition.includes('genres')) {
            console.log('Creating genres container...');
            const trackInfoContainer = document.querySelector(".main-nowPlayingWidget-trackInfo .main-trackInfo-container");
            console.log('Track info container found:', !!trackInfoContainer);

            if (trackInfoContainer) {
                const genresPlaceholder = document.createElement("div");
                genresPlaceholder.className = "main-trackInfo-genres";
                genresPlaceholder.textContent = "Genres Position";
                trackInfoContainer.appendChild(genresPlaceholder);
                console.log('Genres container created and appended');
            }
        }

        setTimeout(() => {
            const releaseDateElement = createReleaseDateElement(localStorage.getItem('separator'), formattedReleaseDate);
            const container = document.querySelector(localStorage.getItem('position'));
            console.log('Target container found:', !!container);
            if (container) {
                container.appendChild(releaseDateElement);
                console.log('Release date element appended to:', container.className);
            }
        }, 50);
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

    if (separator.trim() !== "") {
        const separatorElement = document.createElement("p");
        separatorElement.textContent = separator;
        releaseDateElement.appendChild(separatorElement);
    }

    const dateElement = createAnchorElement(formattedReleaseDate);
    releaseDateElement.appendChild(dateElement);

    const targetedElement = document.querySelector(localStorage.getItem('position') + ' a');
    if (targetedElement) {
        const targetedStyles = window.getComputedStyle(targetedElement);
        setElementStyles(releaseDateElement, targetedStyles);
    }

    const settingsMenu = document.getElementById('settingsMenu');
    if (!settingsMenu) {
        createSettingsMenu();
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
    return anchorElement;
}

function setElementStyles(element, styles) {
    element.style.fontSize = styles.fontSize;
    element.style.fontWeight = styles.fontWeight;
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
        const albumLinkElement = document.createElement('a');
        albumLinkElement.href = album.external_urls.spotify;

        const albumImageElement = document.createElement('img');
        albumImageElement.src = album.images[1].url;
        albumImageElement.width = 64;
        albumImageElement.height = 64;
        albumImageElement.style.marginRight = '1rem';
        albumImageElement.style.objectFit = 'cover';

        const albumNameElement = document.createElement('p');
        albumNameElement.textContent = `${album.name} - ${album.artists[0].name} \n`;

        const albumTypeElement = document.createElement('p');
        albumTypeElement.textContent = album.album_type;
        albumTypeElement.style.cssText = "text-transform: capitalize;";

        const albumContainer = document.createElement('div');

        albumContainer.appendChild(albumNameElement);
        albumContainer.appendChild(albumTypeElement);
        albumLinkElement.appendChild(albumImageElement);
        albumLinkElement.appendChild(albumContainer);

        settingsMenu.appendChild(albumLinkElement);
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
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsMenu) {
        settingsMenu.remove();
    }
    createSettingsMenu();
}
