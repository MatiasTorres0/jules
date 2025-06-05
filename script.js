document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('iptv-video');
    const channelListUl = document.getElementById('channel-list');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    // Sample channel data (replace with your actual M3U playlist parsing or API call)
    const channels = [
        { name: 'Big Buck Bunny', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', type: 'video/mp4' },
        { name: 'Elephants Dream', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', type: 'video/mp4' },
        { name: 'For Bigger Blazes', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', type: 'video/mp4' },
        { name: 'Sintel (HLS)', src: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', type: 'application/x-mpegURL' },
        // Add more channels here if needed
        // { name: 'Channel Name', src: 'channel_url.m3u8', type: 'application/x-mpegURL' },
    ];

    let currentChannelIndex = 0;

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
                playChannel(currentChannelIndex);
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
        if (index >= 0 && index < channels.length) {
            const channel = channels[index];
            if (Hls.isSupported() && channel.type === 'application/x-mpegURL') {
                const hls = new Hls();
                hls.loadSource(channel.src);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play();
                });
                // Optional: destroy previous HLS instance if one exists
                if (video.hls) {
                    video.hls.destroy();
                }
                video.hls = hls; // Store instance
            } else if (video.canPlayType(channel.type || '')) {
                 // Clean up any HLS instance if switching from HLS to MP4
                if (video.hls) {
                    video.hls.destroy();
                    video.hls = null;
                }
                video.src = channel.src;
                video.type = channel.type;
                video.load(); // Important to load the new source
                video.play();
            } else {
                console.error('Unsupported video type or HLS not supported for:', channel.name, channel.type);
                alert(`Cannot play channel: ${channel.name}. Unsupported format.`);
            }
            updatePlayPauseButton();
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
    video.addEventListener('pause', updatePlayPauseButton);
    video.addEventListener('ended', updatePlayPauseButton);
    video.addEventListener('volumechange', () => {
        volumeSlider.value = video.volume; // Sync slider if volume changed elsewhere
    });


    // Initial setup
    loadChannels();
    if (channels.length > 0) {
        playChannel(currentChannelIndex); // Play the first channel by default
    }
    updatePlayPauseButton(); // Set initial button text
    volumeSlider.value = video.volume; // Set initial volume slider value

});
