import { useState } from 'react';

function videoIdFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return id || null;
    }
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

export default function YouTubeVideo({ url, title, className = '' }) {
  const [playing, setPlaying] = useState(false);
  const id = videoIdFromUrl(url);
  if (!id) return null;

  if (playing) {
    return (
      <div className={`relative aspect-video rounded-2xl overflow-hidden bg-black ${className || ''}`}>
        <iframe
          src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0`}
          title={title || 'Exercise video'}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={`relative block aspect-video rounded-2xl overflow-hidden bg-black w-full ${className || ''}`}
    >
      <img
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt={title}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="flex items-center justify-center w-14 h-14 rounded-full bg-black/60">
          <svg viewBox="0 0 24 24" className="w-6 h-6 ml-0.5 fill-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}