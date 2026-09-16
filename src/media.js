export function inspectVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const timer = setTimeout(() => finish(new Error('Video loading timed out. Please try again.')), 12000);
    const finish = (error) => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      const result = { width: video.videoWidth, height: video.videoHeight };
      video.removeAttribute('src');
      video.load();
      if (error) reject(error); else resolve(result);
    };
    video.onloadedmetadata = () => finish(video.videoWidth ? null : new Error('This video has no usable picture.'));
    video.onerror = () => finish(new Error('This browser cannot decode the video. Please use H.264 MP4 or WebM.'));
    video.src = url;
  });
}
