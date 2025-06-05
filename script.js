document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('iptv-video');
    const channelListUl = document.getElementById('channel-list');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const qualitySelect = document.getElementById('quality-select');
    const qualitySelectorDiv = document.querySelector('.quality-selector');
    const qualityLabel = qualitySelectorDiv.querySelector('label');

    // EPG Elements
    const epgInfoContainer = document.getElementById('epg-info-container');
    const epgChannelName = document.getElementById('epg-channel-name');
    const epgCurrentTitle = document.getElementById('epg-current-title');
    const epgCurrentDesc = document.getElementById('epg-current-desc');
    const epgNextTitle = document.getElementById('epg-next-title');
    const epgNextDesc = document.getElementById('epg-next-desc');
    const loadingSpinner = document.getElementById('loading-spinner');

    let epgData = null;
    const xmltvUrl = 'YOUR_XMLTV_URL_HERE'; // Placeholder - user needs to replace this

    // Helper function to log video seekable ranges and duration
    function logVideoSeekableRange() {
        if (!video.hls) return; // Only log for HLS streams active on the video element

        console.log("--- Video Element State for DVR/Replay ---");
        if (video.seekable && video.seekable.length > 0) {
            console.log(`Seekable range count: ${video.seekable.length}`);
            for (let i = 0; i < video.seekable.length; i++) {
                console.log(`Range ${i}: ${video.seekable.start(i).toFixed(2)}s - ${video.seekable.end(i).toFixed(2)}s`);
            }
        } else {
            console.log("No seekable ranges detected or video not ready for seekable check.");
        }
        console.log("Video duration:", video.duration); // For live might be Infinity or large DVR window
        console.log("------------------------------------------");
    }


    // Sample channel data (replace with your actual M3U playlist parsing or API call)
    // For EPG to work well, channels should have a tvgId that matches an ID in your XMLTV file.
    // Example: { name: 'My Channel 1', src: '...', type: '...', tvgId: 'channel1.tvg.id' }
    const channels = [
        { name: 'Big Buck Bunny', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', type: 'video/mp4', tvgId: 'BigBuckBunny' },
        { name: 'Elephants Dream', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', type: 'video/mp4' },
        { name: 'For Bigger Blazes', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', type: 'video/mp4' },
        { name: 'Sintel (HLS)', src: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', type: 'application/x-mpegURL', tvgId: 'SintelHLS' },
        // Add more channels here if needed
        // { name: 'Channel Name', src: 'channel_url.m3u8', type: 'application/x-mpegURL', tvgId: 'some.tvg.id' },
    ];

    let currentChannelIndex = 0;

    // Helper function to parse XMLTV date strings (YYYYMMDDHHMMSS [+-]ZZZZ)
    function parseXmltvDate(dateString) {
        const year = parseInt(dateString.substring(0, 4), 10);
        const month = parseInt(dateString.substring(4, 6), 10) - 1; // Month is 0-indexed
        const day = parseInt(dateString.substring(6, 8), 10);
        const hours = parseInt(dateString.substring(8, 10), 10);
        const minutes = parseInt(dateString.substring(10, 12), 10);
        const seconds = parseInt(dateString.substring(12, 14), 10);

        // Extract timezone offset if present
        const tzOffsetMatch = dateString.substring(14).trim().match(/([+-])(\d{2})(\d{2})/);
        if (tzOffsetMatch) {
            const sign = tzOffsetMatch[1] === '+' ? -1 : 1; // Invert sign for Date.UTC offset calculation
            const tzHours = parseInt(tzOffsetMatch[2], 10);
            const tzMinutes = parseInt(tzOffsetMatch[3], 10);
            const offsetMillis = (tzHours * 60 + tzMinutes) * 60 * 1000 * sign;
            return new Date(Date.UTC(year, month, day, hours, minutes, seconds) + offsetMillis);
        }
        // If no timezone, assume UTC as per original simplified function
        return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    }

    async function fetchAndParseEPG() {
        if (!xmltvUrl || xmltvUrl === 'YOUR_XMLTV_URL_HERE') {
            console.warn("XMLTV URL not configured. EPG data will not be loaded.");
            epgInfoContainer.style.display = 'none';
            return null;
        }
        try {
            const response = await fetch(xmltvUrl);
            if (!response.ok) {
                console.error(`Failed to fetch EPG data. Status: ${response.status}`);
                epgInfoContainer.style.display = 'none';
                return null;
            }
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            const programsByChannel = {};
            // const channelElements = xmlDoc.getElementsByTagName('channel'); // For mapping tvg-name to id
            const programElements = xmlDoc.getElementsByTagName('programme');

            Array.from(programElements).forEach(prog => {
                const channelId = prog.getAttribute('channel');
                const start = prog.getAttribute('start');
                const stop = prog.getAttribute('stop');
                const titleEl = prog.getElementsByTagName('title')[0];
                const descEl = prog.getElementsByTagName('desc')[0];

                if (!channelId || !start || !stop || !titleEl) return; // Skip incomplete program entries

                const programInfo = {
                    start: parseXmltvDate(start),
                    stop: parseXmltvDate(stop),
                    title: titleEl.textContent,
                    description: descEl ? descEl.textContent : ''
                };

                if (!programsByChannel[channelId]) {
                    programsByChannel[channelId] = [];
                }
                programsByChannel[channelId].push(programInfo);
            });

            for (const channelId in programsByChannel) {
                programsByChannel[channelId].sort((a, b) => a.start - b.start);
            }
            epgData = programsByChannel;
            console.log("EPG data loaded and parsed:", epgData);
            return epgData;
        } catch (error) {
            console.error("Error fetching or parsing EPG data:", error);
            epgInfoContainer.style.display = 'none';
            return null;
        }
    }

    function displayEPGForChannel(channelName, tvgId) {
        if (!epgData) {
            epgInfoContainer.style.display = 'none';
            return;
        }

        let channelPrograms = null;
        if (tvgId && epgData[tvgId]) { // Try matching by tvgId first
            channelPrograms = epgData[tvgId];
        } else { // Fallback to channel name (less reliable)
            const matchingKey = Object.keys(epgData).find(key => key.toLowerCase() === channelName.toLowerCase());
            if (matchingKey) {
                channelPrograms = epgData[matchingKey];
            }
        }

        if (!channelPrograms || channelPrograms.length === 0) {
            epgInfoContainer.style.display = 'none';
            return;
        }

        const now = new Date();
        let currentProgram = null;
        let nextProgram = null;

        for (let i = 0; i < channelPrograms.length; i++) {
            const prog = channelPrograms[i];
            if (prog.start <= now && prog.stop > now) {
                currentProgram = prog;
                if (i + 1 < channelPrograms.length) {
                    nextProgram = channelPrograms[i+1];
                }
                break;
            }
            if (!currentProgram && prog.start > now) { // First upcoming if nothing is "now"
                if(!currentProgram || prog.start < currentProgram.start) { // check if it's earlier than already found upcoming
                   currentProgram = prog;
                   if (i + 1 < channelPrograms.length) {
                       nextProgram = channelPrograms[i+1];
                   } else {
                       nextProgram = null; // No more programs after this upcoming one
                   }
                }
            }
        }
        // if still no current program, it means all programs are in the past.
        // Optionally, show the last played or next day's first program. For now, it will show N/A.


        epgChannelName.textContent = channelName;

        const currentProgramDiv = document.getElementById('epg-current-program');
        const nextProgramDiv = document.getElementById('epg-next-program');

        if (currentProgram) {
            currentProgramDiv.style.display = 'block';
            epgCurrentTitle.textContent = currentProgram.title;
            epgCurrentDesc.textContent = currentProgram.description || '';
        } else {
            currentProgramDiv.style.display = 'none';
            epgCurrentTitle.textContent = 'N/A';
            epgCurrentDesc.textContent = '';
        }

        if (nextProgram && nextProgram.start >= (currentProgram ? currentProgram.stop : now)) { // ensure next is truly after current
            nextProgramDiv.style.display = 'block';
            epgNextTitle.textContent = nextProgram.title;
            epgNextDesc.textContent = nextProgram.description || '';
        } else {
             // If current program exists but no valid next program, clear next program fields
            if (currentProgram && nextProgram && nextProgram.start < currentProgram.stop) {
                 nextProgram = null; // Invalidate next program if it overlaps or is before current ends
            }
            nextProgramDiv.style.display = 'none';
            epgNextTitle.textContent = 'N/A';
            epgNextDesc.textContent = '';
        }

        if (currentProgram || nextProgram) {
            epgInfoContainer.style.display = 'block';
        } else {
            epgInfoContainer.style.display = 'none';
        }
    }

    function loadChannels() {
        channelListUl.innerHTML = ''; // Clear existing list
        channels.forEach((channel, index) => {
            const li = document.createElement('li');
            li.textContent = channel.name;
            li.dataset.index = index;
            if (index === currentChannelIndex) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => {
                currentChannelIndex = index;
                playChannel(currentChannelIndex); // This will also call displayEPGForChannel
                updateActiveClass();
            });
            channelListUl.appendChild(li);
        });
    }

    function updateActiveClass() {
        const items = channelListUl.querySelectorAll('li');
        items.forEach((item, index) => {
            if (index === currentChannelIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function playChannel(index) {
        if (loadingSpinner) loadingSpinner.style.display = 'flex'; // Show spinner

        if (index >= 0 && index < channels.length) {
            const channel = channels[index];
            if (Hls.isSupported() && channel.type === 'application/x-mpegURL') {
                if (video.hls) {
                    video.hls.destroy();
                }
                const hls = new Hls();
                video.hls = hls; // Store instance

                hls.loadSource(channel.src);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                    console.log("HLS Manifest parsed event.");
                    // Log HLS manifest-derived properties for DVR/replay investigation
                    console.log("--- HLS Manifest Details for DVR/Replay ---");
                    if (data.levels && data.levels.length > 0 && data.levels[0].details) {
                        const levelDetails = data.levels[0].details;
                        console.log("Stream type (from level details):", levelDetails.type); // e.g., LIVE or VOD
                        console.log("Is stream live (from level details)?", levelDetails.live);
                        console.log("Target duration (from level details):", levelDetails.targetduration);
                        console.log("Total duration (from level details):", levelDetails.totalduration); // Manifest's view of duration
                        // Additional potentially useful properties from levelDetails if they exist:
                        // console.log("DVR Playlist:", levelDetails.dvr); // Example, check HLS.js docs for actual names
                        // console.log("Live Back Buffer length:", levelDetails.liveBackBufferLength); // Example
                    } else {
                        console.log("No detailed level data found in manifest for DVR logging.");
                    }
                     console.log("HLS Config (DVR related example): liveSyncDurationCount:", hls.config.liveSyncDurationCount, "liveMaxLatencyDurationCount:", hls.config.liveMaxLatencyDurationCount);
                     console.log("-------------------------------------------");

                    // Latency-related logging for live streams
                    if (data.levels && data.levels.length > 0 && data.levels[0].details && data.levels[0].details.live) {
                        console.log("--- HLS Latency Control Investigation (for LIVE stream) ---");
                        console.log("hls.config.liveSyncDurationCount (target segments from edge):", hls.config.liveSyncDurationCount);
                        console.log("hls.config.liveMaxLatencyDurationCount (max segments before seeking):", hls.config.liveMaxLatencyDurationCount);
                        console.log("hls.config.liveDurationInfinity (manifest #EXT-X-PLAYLIST-TYPE:LIVE):", hls.config.liveDurationInfinity);
                        console.log("hls.config.maxLiveSyncPlaybackRate (playback rate for catchup):", hls.config.maxLiveSyncPlaybackRate);

                        if (typeof hls.latency !== 'undefined') {
                            console.log("Current HLS.js reported 'hls.latency' (at manifest parse time):", hls.latency.toFixed(3) + "s");
                        } else {
                            console.log("'hls.latency' property not directly available on this HLS.js version or at manifest parse stage.");
                        }
                        // Example of listening to an event that might give more dynamic latency related data:
                        // hls.on(Hls.Events.FRAG_BUFFERED, function(event, eventData) {
                        //     if (eventData.frag && eventData.frag.stats && typeof hls.latency === 'number') {
                        //         // Log latency when a fragment is buffered, if available
                        //         console.log(`HLS Latency (on FRAG_BUFFERED for ${eventData.frag.relurl}): ${hls.latency.toFixed(3)}s`);
                        //     }
                        // });
                        console.log("---------------------------------------------------------");
                    }

                    if (data.levels && data.levels.length > 1) {
                        qualitySelectorDiv.style.display = 'flex';
                        qualitySelect.style.display = 'inline-block';
                        if (qualityLabel) qualityLabel.style.display = 'inline-block';
                        qualitySelect.innerHTML = ''; // Clear previous options

                        const autoOption = document.createElement('option');
                        autoOption.value = -1;
                        autoOption.textContent = 'Auto';
                        qualitySelect.appendChild(autoOption);

                        data.levels.forEach((level, index) => {
                            const option = document.createElement('option');
                            option.value = index;
                            let levelName = level.height ? level.height + 'p' : (level.bitrate / 1000).toFixed(0) + 'kbps';
                            if (level.name) levelName += ` (${level.name})`;
                            option.textContent = levelName;
                            qualitySelect.appendChild(option);
                        });

                        hls.currentLevel = -1; // Default to Auto
                        qualitySelect.value = -1;

                        qualitySelect.onchange = () => {
                            hls.currentLevel = parseInt(qualitySelect.value);
                            console.log("Quality changed to level index:", hls.currentLevel);
                        };
                    } else {
                        qualitySelectorDiv.style.display = 'none';
                        qualitySelect.style.display = 'none';
                        if (qualityLabel) qualityLabel.style.display = 'none';
                    }
                    video.play(); // Play video after manifest is parsed and levels are set up
                });

                hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                    if (qualitySelect.style.display !== 'none') {
                        qualitySelect.value = data.level;
                        console.log("Switched to quality level index:", data.level);
                    }
                });

                hls.on(Hls.Events.LOADEDMETADATA, function(event, hlsData) { // Renamed data to hlsData to avoid conflict
                    console.log("HLS LOADEDMETADATA event triggered.");
                    logVideoSeekableRange(); // Log seekable range when metadata is loaded
                });

                hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.error("HLS fatal error:", data.details ? data.details : data);
                        if (loadingSpinner) loadingSpinner.style.display = 'none'; // Hide spinner
                        qualitySelectorDiv.style.display = 'none';
                        qualitySelect.style.display = 'none';
                        if (qualityLabel) qualityLabel.style.display = 'none';
                        switch(data.type) {
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                // Destroy HLS instance on other fatal errors
                                if(video.hls) video.hls.destroy();
                                video.hls = null;
                                break;
                        }
                    }
                });

            } else if (video.canPlayType(channel.type || '')) {
                if (video.hls) {
                    video.hls.destroy();
                    video.hls = null;
                }
                qualitySelectorDiv.style.display = 'none';
                qualitySelect.style.display = 'none';
                if (qualityLabel) qualityLabel.style.display = 'none';
                video.src = channel.src;
                video.type = channel.type;
                video.load(); // Important to load the new source
                video.play();
            } else {
                // Hide quality selector if channel is not playable
                qualitySelectorDiv.style.display = 'none';
                qualitySelect.style.display = 'none';
                if (qualityLabel) qualityLabel.style.display = 'none';
                if (video.hls) { // Clean up HLS if it exists
                    video.hls.destroy();
                    video.hls = null;
                }
                console.error('Unsupported video type or HLS not supported for:', channel.name, channel.type);
                alert(`Cannot play channel: ${channel.name}. Unsupported format.`);
                if (loadingSpinner) loadingSpinner.style.display = 'none'; // Hide spinner on error
            }
            updatePlayPauseButton();
            // Display EPG for the selected channel
            const selectedChannel = channels[index];
            displayEPGForChannel(selectedChannel.name, selectedChannel.tvgId);
        }
    }

    function togglePlayPause() {
        if (video.paused || video.ended) {
            video.play();
        } else {
            video.pause();
        }
        updatePlayPauseButton();
    }

    function updatePlayPauseButton() {
        if (video.paused || video.ended) {
            playPauseBtn.textContent = 'Play';
        } else {
            playPauseBtn.textContent = 'Pause';
        }
    }

    function handleVolumeChange() {
        video.volume = volumeSlider.value;
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.mozRequestFullScreen) { /* Firefox */
                video.mozRequestFullScreen();
            } else if (video.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                video.webkitRequestFullscreen();
            } else if (video.msRequestFullscreen) { /* IE/Edge */
                video.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    // Event Listeners
    playPauseBtn.addEventListener('click', togglePlayPause);
    volumeSlider.addEventListener('input', handleVolumeChange);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    video.addEventListener('play', updatePlayPauseButton);
    video.addEventListener('pause', updatePlayPauseButton); // Spinner could be hidden here too if needed
    video.addEventListener('ended', updatePlayPauseButton);
    video.addEventListener('volumechange', () => {
        volumeSlider.value = video.volume; // Sync slider if volume changed elsewhere
    });
    video.addEventListener('playing', () => {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    });
    video.addEventListener('error', (e) => {
        console.error("Video element error:", e);
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        // Optionally, update UI to show a more user-friendly error message
        updatePlayPauseButton(); // Ensure button state is correct
        // Could also try to display an error overlay on the video
    });


    // Initial setup
    loadChannels();

    fetchAndParseEPG().then(() => {
        if (channels.length > 0) {
            playChannel(currentChannelIndex); // Play the first channel by default and load its EPG
        }
    }).catch(error => { // Catch errors from fetchAndParseEPG promise itself if any
        console.error("Error during initial EPG fetch:", error);
        if (channels.length > 0) { // Still play channel even if EPG fails
            playChannel(currentChannelIndex);
        }
    });

    updatePlayPauseButton(); // Set initial button text
    volumeSlider.value = video.volume; // Set initial volume slider value
});
