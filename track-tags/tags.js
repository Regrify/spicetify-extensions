console.log('[TAGS] [Track Tags] loaded');

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

window.operatingSystem = window.operatingSystem || null;
(async function () {
    await waitForTrackData();
    if (window.operatingSystem == null) {
        let details = await getTrackDetailsTags();
        window.operatingSystem = details.operatingSystem;
    }
})();

async function tagCSS() {
    const tagStyle = document.createElement('style');
    tagStyle.innerHTML = `
        .main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-enhanced {
                align-items: center;
            }
        .playing-tags {
            display: flex;
            gap: 3px;
            min-width: 0;
        }
        .playing-tags span > * {
            display: flex;
            object-fit: contain;
            max-width: 16px;
            max-height: 16px;
            fill: var(--text-bright-accent);
        }
        .playing-playlist-tag,
        .playing-heart-tag {
            cursor: pointer;
        }
        .playing-playlist-tag {
            border-radius: 50%;
        }
        .playing-explicit-tag {
            display: inline-flex;
            justify-content: center;
            align-items: center;
            background-color: var(--text-subdued);
            border-radius: 2px;
            color: var(--background-base);
            flex-wrap: nowrap;
            font-size: 10.5px;
            font-weight: 600;
            line-height: 14px;
            padding-block: 1px;
            padding-inline: 5px;
            text-transform: capitalize;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
        }
        .main-trackInfo-artists {
            place-self: flex-end;
        }
    `;
    return tagStyle;
}

async function getTrackDetailsTags() {
    await waitForTrackData();
    
    const playerData = Spicetify.Player.data;
    if (!playerData || !playerData.item || !playerData.item.uri) {
        throw new Error('No track data available');
    }

    const trackUri = playerData.item.uri;
    const trackId = trackUri.split(':')[2];

    let trackDetails;
    try {
        const hexTrackId = Spicetify.URI.idToHex(Spicetify.URI.from(trackUri).id);
        console.log('[TAGS] Trying internal track API with hex ID:', hexTrackId);
        
        const trackResponse = await Spicetify.Platform.RequestBuilder.build()
            .withHost("https://spclient.wg.spotify.com/metadata/4")
            .withPath(`/track/${hexTrackId}`)
            .send();
        
        trackDetails = await trackResponse.body;
        console.log('[TAGS] Internal track API response:', JSON.stringify(trackDetails, null, 2));
    } catch (internalTrackError) {
        if (internalTrackError.message && internalTrackError.message.includes('DUPLICATE_REQUEST_ERROR')) {
            console.log('[TAGS] Duplicate request detected, skipping retry and using player data');
            trackDetails = null;
        } else {
            console.log('[TAGS] Internal track API failed, using player data:', internalTrackError);
            trackDetails = null;
        }
    }

    console.log('[TAGS] Player data available:', JSON.stringify(playerData, null, 2));
    console.log('[TAGS] Track details from API:', trackDetails);
    
    const normalizedTrackDetails = {
        id: trackId,
        uri: trackUri,
        name: trackDetails?.name || playerData.item.name,
        explicit: trackDetails?.explicit ?? playerData.item.explicit ?? playerData.item.metadata?.is_explicit === 'true' ?? false,
        album: {
            name: trackDetails?.album?.name || playerData.item.album.name,
            uri: trackDetails?.album?.uri || playerData.item.album.uri
        },
        artists: trackDetails?.artist || playerData.item.artists
    };

    console.log('[TAGS] Normalized track details:', JSON.stringify(normalizedTrackDetails, null, 2));

    let savedTrack = [false];
    let likedSongs = { items: [] };
    
    try {
        if (Spicetify.Player && Spicetify.Player.data && Spicetify.Player.data.item) {
            const isLiked = Spicetify.Player.data.item.metadata?.['collection.in_collection'] === 'true';
            savedTrack = [isLiked];
            console.log('[TAGS] Track liked status:', isLiked);
            console.log('[TAGS] Player metadata:', JSON.stringify(Spicetify.Player.data.item.metadata, null, 2));
        }
    } catch (libraryError) {
        console.log('[TAGS] Could not determine liked status:', libraryError);
    }

    let downloadedSongs = { items: [] };
    try {
        downloadedSongs = await Spicetify.Platform.OfflineAPI._offline.getItems(0, Spicetify.Platform.OfflineAPI._offline.getItems.length);
        console.log('[TAGS] Downloaded songs count:', downloadedSongs.items.length);
    } catch (downloadError) {
        console.log('[TAGS] Could not get downloaded songs:', downloadError);
    }

    let operatingSystem = await Spicetify.Platform.operatingSystem;

    return { trackDetails: normalizedTrackDetails, savedTrack, likedSongs, downloadedSongs, operatingSystem };
}


(async function () {
    await initializeTags();
})();


async function initializeTags() {
    try {
        await waitForSpicetify();

        let debounceTimer;
        Spicetify.Player.addEventListener("songchange", async () => {
            removeExistingTagElement();
            if (!debounceTimer) {
                debounceTimer = setTimeout(async () => {
                    await displayTags();
                    debounceTimer = null;
                }, 1);
            }
        });

        if (window.operatingSystem === "Windows") {
            await Spicetify.Player.dispatchEvent(new Event('songchange'));
        } else {
            await displayTags();
        }

        document.head.appendChild(await tagCSS());
    } catch (error) {
        console.error('[TAGS] Error initializing: ', error, "\nCreate a new issue on the github repo to get this resolved");
    }
}

async function displayTags() {
    let downloaded = false;
    try {
        const { trackDetails, savedTrack, downloadedSongs } = await getTrackDetailsTags();

        const Tagslist = document.querySelector('.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-enhanced');
        
        if (!Tagslist) {
            console.error('[TAGS] Could not find track info container to display tags');
            return;
        }

        const tagsDiv = document.createElement('div');
        tagsDiv.setAttribute('class', 'playing-tags');

        const nowPlayingPlaylistDetails = await Spicetify.Platform.PlayerAPI.getState();

        downloadedSongs.items.forEach(song => {
            if (song.uri.includes(trackDetails.id)) {
                downloaded = true;
            }
        });


        if (nowPlayingPlaylistDetails.context.uri) {
            const split = nowPlayingPlaylistDetails.context.uri.split(':');
            const contextType = split[1];
            const playlistName = nowPlayingPlaylistDetails.context.format_list_type;
            
            console.log('[TAGS] Context URI:', nowPlayingPlaylistDetails.context.uri);
            console.log('[TAGS] Split URI:', split);
            console.log('[TAGS] Context type:', contextType);
            console.log('[TAGS] Playlist name:', playlistName);

            const playlistSpan = document.createElement('span');
            playlistSpan.setAttribute('class', 'Wrapper-sm-only Wrapper-small-only');
            
            if (contextType === "user" && split[3] === "collection") {
                console.log('[TAGS] Detected user collection, treating as Liked Songs');
                playlistImgSrc = "https://misc.scdn.co/liked-songs/liked-songs-300.png";
                playlistSpan.setAttribute('title', `Playing from Liked Songs`);
                songLocation = `/collection/tracks?uri=${trackDetails.uri}`;
            } else if (playlistName == "liked-songs") {
                playlistImgSrc = "https://misc.scdn.co/liked-songs/liked-songs-300.png";
                songLocation = `/${split[3]}/tracks?uri=${trackDetails.uri}`;
                playlistSpan.setAttribute('title', `Playing from Liked Songs`);
            } else {
                const imageUrl = nowPlayingPlaylistDetails.context.metadata.image_url;
                if (imageUrl && imageUrl !== 'undefined') {
                    playlistImgSrc = "https://image-cdn-ak.spotifycdn.com/image/" + imageUrl;
                } else {
                    playlistImgSrc = "https://raw.githubusercontent.com/Plueres/spicetify-extensions/main/track-tags/spotify_playlist.webp";
                }
                songLocation = `/${split[1]}/${split[2]}?uid=${nowPlayingPlaylistDetails.item.uid}`;
                playlistSpan.setAttribute('title', `Playing from ${nowPlayingPlaylistDetails.context.metadata.context_description || 'Playlist'}`);
            }
            playlistSpan.onclick = function () { Spicetify.Platform.History.push(songLocation); };

            const playlistImg = document.createElement('img');
            playlistImg.setAttribute('src', playlistImgSrc);
            playlistImg.setAttribute('height', '24');
            playlistImg.setAttribute('width', '24');
            playlistImg.setAttribute('class', 'Svg-img-icon-small-textBrightAccent playing-playlist-tag');
            playlistImg.setAttribute('onerror', "this.onerror=null; this.src='https://raw.githubusercontent.com/Plueres/spicetify-extensions/main/track-tags/spotify_playlist.webp'");

            playlistSpan.appendChild(playlistImg);

            tagsDiv.appendChild(playlistSpan);
        }
        if (savedTrack[0]) {
            const savedTrackSpan = document.createElement('span');

            savedTrackSpan.setAttribute('class', 'Wrapper-sm-only Wrapper-small-only');
            savedTrackSpan.setAttribute('title', 'This song is in your liked songs collection');

            const savedTrackSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            savedTrackSvg.setAttribute('role', 'img');
            savedTrackSvg.setAttribute('height', '24');
            savedTrackSvg.setAttribute('width', '24');
            savedTrackSvg.setAttribute('viewBox', '0 0 24 24');
            savedTrackSvg.setAttribute('class', 'Svg-img-icon-small-textBrightAccent playing-heart-tag');

            const savedTrackPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            savedTrackPath.setAttribute('d', 'M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z');

            savedTrackSvg.appendChild(savedTrackPath);
            savedTrackSpan.appendChild(savedTrackSvg);

            savedTrackSpan.onclick = async function () {
                if (confirm('Are you sure you want to remove this song from your liked songs?')) {
                    Spicetify.Player.toggleHeart();
                    await removeExistingTagElement();
                    setTimeout(() => {
                        displayTags();
                    }, 1000);
                }
            };

            tagsDiv.appendChild(savedTrackSpan);
        }
        if (downloaded) {
            const downloadedSpan = document.createElement('span');

            downloadedSpan.setAttribute('class', 'encore-text encore-text-body-medium encore-internal-color-text-subdued main-trackList-rowBadges');
            downloadedSpan.setAttribute('data-encore-id', 'text');
            downloadedSpan.setAttribute('title', 'This song is downloaded');

            const downloadedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            downloadedSvg.setAttribute('data-encore-id', 'icon');
            downloadedSvg.setAttribute('role', 'img');
            downloadedSvg.setAttribute('aria-hidden', 'false');
            downloadedSvg.setAttribute('viewBox', '0 0 16 16');
            downloadedSvg.setAttribute('class', 'Svg-sc-ytk21e-0 Svg-img-icon-small-textBrightAccent playing-downloaded-tag');

            const downloadedPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            downloadedPath.setAttribute('d', 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-4.75a.75.75 0 0 0-.75.75v5.94L6.055 8.744a.75.75 0 1 0-1.06 1.06L8 12.811l3.005-3.006a.75.75 0 1 0-1.06-1.06L8.75 9.939V4A.75.75 0 0 0 8 3.25z');

            downloadedSvg.appendChild(downloadedPath);
            downloadedSpan.appendChild(downloadedSvg);

            tagsDiv.appendChild(downloadedSpan);
        }
        if (trackDetails.explicit) {
            const explicitSpan = document.createElement('span');

            explicitSpan.setAttribute('aria-label', 'Explicit');
            explicitSpan.setAttribute('class', 'main-tag-container playing-explicit-tag');
            explicitSpan.setAttribute('title', 'Warning!, This song is explicit and may contain strong language or themes.');
            explicitSpan.textContent = 'E';

            tagsDiv.appendChild(explicitSpan);
        }

        Tagslist.prepend(tagsDiv);
    } catch (error) {
                console.error('[TAGS] Error displaying tags: ', error);
    }
}
function removeExistingTagElement() {
    const existingTagElements = document.querySelectorAll('.main-nowPlayingWidget-nowPlaying:not(#upcomingSongDiv) .main-trackInfo-enhanced .playing-tags');
    existingTagElements.forEach(element => element.remove());
}
