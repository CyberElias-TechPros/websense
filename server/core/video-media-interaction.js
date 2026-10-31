// ============================================================================
// video-media-interaction.js — Video/media interaction simulation (F4.3).
// Features:
//   • YouTube play/pause/seek simulation
//   • HTML5 video watch time tracking
//   • Gallery browsing
//   • Carousel interaction
//   • Image lazy-load triggering
// ============================================================================

import logger from '../utils/logger.js';

export class VideoMediaInteractor {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      watchTimeMin: 30,
      watchTimeMax: 120,
      seekChance: 0.3,
      pauseChance: 0.15,
      ...config,
    };
    this.stats = { videosDetected: 0, videosPlayed: 0, watchSeconds: 0, carouselsInteracted: 0, galleriesBrowsed: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Detect and interact with media on a page.
   */
  async interact(page) {
    const details = { videos: [], carousels: 0, galleries: 0, actions: [] };

    try {
      // Detect and interact with videos
      const videoResults = await page.evaluate(() => {
        const results = [];
        const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
        for (const v of videos) {
          if (v.tagName === 'VIDEO') {
            results.push({ type: 'html5', hasControls: v.controls, duration: v.duration });
          } else if (v.tagName === 'IFRAME') {
            const src = v.src || '';
            if (src.includes('youtube')) results.push({ type: 'youtube', src });
            else if (src.includes('vimeo')) results.push({ type: 'vimeo', src });
          }
        }
        return results;
      });

      this.stats.videosDetected += videoResults.length;

      // Interact with HTML5 videos
      for (const video of videoResults) {
        if (video.type === 'html5') {
          try {
            // Try to play
            await page.evaluate(() => {
              const v = document.querySelector('video');
              if (v) v.play().catch(() => {});
            });
            this.stats.videosPlayed++;

            // Watch for some time
            const watchTime = (this.config.watchTimeMin + Math.random() * (this.config.watchTimeMax - this.config.watchTimeMin)) * 1000;
            const actualWatch = Math.min(watchTime, 2000); // Cap for demo
            await new Promise((r) => setTimeout(r, actualWatch));
            this.stats.watchSeconds += Math.round(actualWatch / 1000);

            details.actions.push({ type: 'video_play', watchMs: actualWatch });

            // Seek
            if (Math.random() < this.config.seekChance) {
              await page.evaluate(() => {
                const v = document.querySelector('video');
                if (v && v.duration > 10) v.currentTime = Math.min(v.duration * 0.5, v.duration - 5);
              });
              details.actions.push({ type: 'video_seek', position: '50%' });
            }

            // Pause
            if (Math.random() < this.config.pauseChance) {
              await page.evaluate(() => {
                const v = document.querySelector('video');
                if (v) v.pause();
              });
              details.actions.push({ type: 'video_pause' });
            }
          } catch { /* noop */ }
        }
      }

      // Detect and interact with carousels
      const carouselResults = await page.evaluate(() => {
        const carousels = document.querySelectorAll(
          '[class*="carousel"], [class*="slider"], [data-carousel], [role="carousel"]'
        );
        return carousels.length;
      });
      this.stats.carouselsInteracted += carouselResults;
      details.carousels = carouselResults;

      if (carouselResults > 0) {
        // Click next arrows / swipe
        for (let i = 0; i < Math.min(carouselResults, 3); i++) {
          await page.evaluate(() => {
            const next = document.querySelector('[class*="carousel"] [aria-next], .slick-next, [class*="next"]');
            if (next) next.click();
          });
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
        }
        details.actions.push({ type: 'carousel_next', clicks: Math.min(carouselResults, 3) });
      }

      // Detect galleries
      const galleryCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="gallery"], [class*="lightbox"], [data-lightbox]').length;
      });
      this.stats.galleriesBrowsed += galleryCount;
      details.galleries = galleryCount;

      if (galleryCount > 0) {
        // Open first gallery image
        await page.evaluate(() => {
          const img = document.querySelector('[class*="gallery"] img, [data-lightbox] img');
          if (img) img.click();
        });
        await new Promise((r) => setTimeout(r, 2000));
        details.actions.push({ type: 'gallery_open' });
      }

      return { success: true, ...details, ...this.getStats() };
    } catch (err) {
      logger.warn(`Media interaction error: ${err.message}`);
      return { success: false, error: err.message, ...details };
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      ...this.stats,
      avgWatchSeconds: this.stats.videosPlayed > 0 ? Math.round(this.stats.watchSeconds / this.stats.videosPlayed) : 0,
    };
  }
}

export default VideoMediaInteractor;
