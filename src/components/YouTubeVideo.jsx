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
        <svg viewBox="0 0 68 48" className="w-16 h-auto">
          <path
            d="M66.52 7.74c-.78-2.93-2.49-5.41-4.86-6.51C57.36 0 33.66 0 33.66 0S9.96 0 5.66 1.23C3.29 2.33 1.58 4.81.8 7.74.02 11.4 0 24 0 24s.02 12.6.8 16.26c.78 2.93 2.49 5.41 4.86 6.51C9.96 48 33.66 48 33.66 48s23.7 0 27.94-1.23c2.37-1.1 4.08-3.58 4.86-6.51.78-3.66.8-16.26.8-16.26s-.02-12.6-.8-16.26z"
            fill="#f00"
          />
          <path d="M27 34l17.5-10L27 14v20z" fill="#fff" />
        </svg>
      </span>
    </button>
  );
}