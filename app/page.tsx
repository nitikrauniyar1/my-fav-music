"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

type Song = { title: string; artist: string; src: string; cover: string | null };

export default function Home() {
  // Intro Animation States - 3 Phases: visible -> fading -> gone
  const [greetingPhase, setGreetingPhase] = useState<'visible' | 'fading' | 'gone'>('visible');

  // Dynamic Playlist States
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  
  // Audio Player States
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  // Custom FX States
  const [bassBoost, setBassBoost] = useState(false);
  const [spatialAudio, setSpatialAudio] = useState(false);
  
  // Web Audio API Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bassNodeRef = useRef<BiquadFilterNode | null>(null);
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Playback Modes
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const res = await fetch('/api/songs');
        const data = await res.json();
        if (data.length > 0) {
          setPlaylist(data);
          const savedIndex = localStorage.getItem('currentSongIndex');
          if (savedIndex && Number(savedIndex) < data.length) {
            setCurrentSongIndex(Number(savedIndex));
          }
        }
      } catch (error) {
        console.error("Failed to load songs", error);
      }
    };
    fetchSongs();
  }, []);

  const currentSong = playlist[currentSongIndex] || { title: "Loading...", artist: "Please wait", src: "", cover: null };

  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem('currentSongIndex', currentSongIndex.toString());
    }
  }, [currentSongIndex, playlist]);

  // FORCEFUL 2-STEP GREETING REMOVAL
  useEffect(() => {
    // Step 1: Force fade out exactly at 1000ms (1s)
    const fadeTimer = setTimeout(() => {
      setGreetingPhase('fading');
    }, 1000); 

    // Step 2: RUTHLESSLY remove it from the DOM completely at 2000ms
    const killTimer = setTimeout(() => {
      setGreetingPhase('gone');
    }, 2000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(killTimer);
    };
  }, []);

  const playNext = useCallback(() => {
    if (playlist.length === 0) return;
    if (isShuffle) {
      setCurrentSongIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentSongIndex((prev) => (prev + 1) % playlist.length);
    }
    setIsPlaying(true);
  }, [playlist.length, isShuffle]);

  const playPrev = useCallback(() => {
    if (playlist.length === 0) return;
    setCurrentSongIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
    setIsPlaying(true);
  }, [playlist.length]);

  const togglePlayPause = useCallback(() => {
    if (playlist.length > 0) setIsPlaying(!isPlaying);
  }, [playlist.length, isPlaying]);

  const handleEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      playNext();
    }
  };

  useEffect(() => {
    if (bassNodeRef.current && audioCtxRef.current) {
      bassNodeRef.current.gain.setTargetAtTime(bassBoost ? 15 : 0, audioCtxRef.current.currentTime, 0.5);
    }
  }, [bassBoost]);

  useEffect(() => {
    let animationId: number;
    let time = 0;
    const animatePan = () => {
      if (spatialAudio && pannerNodeRef.current) {
        pannerNodeRef.current.pan.value = Math.sin(time);
        time += 0.005; 
      } else if (!spatialAudio && pannerNodeRef.current) {
        pannerNodeRef.current.pan.value = 0;
      }
      animationId = requestAnimationFrame(animatePan);
    };
    animatePan();
    return () => cancelAnimationFrame(animationId);
  }, [spatialAudio]);

  useEffect(() => {
    if (audioRef.current && playlist.length > 0) {
      if (isPlaying) {
        audioRef.current.play().then(() => {
          if (!audioCtxRef.current && canvasRef.current) {
            try {
              const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
              audioCtxRef.current = new AudioContext();
              const analyser = audioCtxRef.current.createAnalyser();
              
              const bassFilter = audioCtxRef.current.createBiquadFilter();
              bassFilter.type = "lowshelf";
              bassFilter.frequency.value = 150; 
              bassFilter.gain.value = bassBoost ? 15 : 0;
              bassNodeRef.current = bassFilter;

              const panner = audioCtxRef.current.createStereoPanner();
              pannerNodeRef.current = panner;

              sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current!);
              
              sourceRef.current.connect(bassFilter);
              bassFilter.connect(panner);
              panner.connect(analyser);
              analyser.connect(audioCtxRef.current.destination);
              
              analyser.fftSize = 256;
              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);
              const canvas = canvasRef.current;
              const ctx = canvas.getContext("2d");

              canvas.width = Math.max(canvas.offsetWidth * 2, 200);
              canvas.height = Math.max(canvas.offsetHeight * 2, 200);

              let visualizerId: number;
              const draw = () => {
                visualizerId = requestAnimationFrame(draw);
                if (!ctx) return;
                analyser.getByteFrequencyData(dataArray);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                
                const minDim = Math.min(canvas.width, canvas.height);
                const baseRadius = minDim / 3.5;
                const maxBarHeight = (minDim / 2) - baseRadius - 10; 

                for (let i = 0; i < bufferLength; i++) {
                  if (i > bufferLength * 0.75) continue; 
                  
                  const barHeight = (dataArray[i] / 255) * maxBarHeight;
                  const rads = (Math.PI * 2) * (i / (bufferLength * 0.75));
                  
                  const x = centerX + Math.cos(rads) * baseRadius;
                  const y = centerY + Math.sin(rads) * baseRadius;
                  const xEnd = centerX + Math.cos(rads) * (baseRadius + barHeight);
                  const yEnd = centerY + Math.sin(rads) * (baseRadius + barHeight);

                  let r = 251, g = 191, b = 36; 
                  if (spatialAudio) { r = 56; g = 189; b = 248; } 
                  if (bassBoost && !spatialAudio) { r = 239; g = 68; b = 68; } 

                  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${barHeight / maxBarHeight + 0.2})`;
                  ctx.lineWidth = 4;
                  ctx.lineCap = "round";
                  ctx.beginPath();
                  ctx.moveTo(x, y);
                  ctx.lineTo(xEnd, yEnd);
                  ctx.stroke();
                }
              };
              draw();
              
            } catch (e) { console.log("AudioContext already initialized"); }
          }
        }).catch(() => setIsPlaying(false));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSongIndex, playlist, spatialAudio, bassBoost]); 

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if ('mediaSession' in navigator && currentSong.title !== "Loading...") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        artwork: currentSong.cover ? [{ src: currentSong.cover, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', playPrev);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
  }, [currentSong, playNext, playPrev]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return; 
      if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
      if (e.code === 'ArrowRight') { 
        if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration);
      }
      if (e.code === 'ArrowLeft') { 
        if (audioRef.current) audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, duration]);

  const [touchStart, setTouchStart] = useState(0);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX;
    if (touchStart - touchEnd > 50) playNext();
    if (touchStart - touchEnd < -50) playPrev(); 
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      localStorage.setItem('currentTime', audioRef.current.currentTime.toString());
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      const savedTime = localStorage.getItem('currentTime');
      if (savedTime && audioRef.current.currentTime < 1) {
        audioRef.current.currentTime = Number(savedTime);
      }
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const roundedTime = Math.round(time);
    const minutes = Math.floor(roundedTime / 60);
    const seconds = roundedTime % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <main className="relative min-h-screen h-[100dvh] w-full flex flex-col items-center justify-center p-4 sm:p-6 font-sans text-white bg-black overflow-hidden selection:bg-amber-500/30">
      
      {/* Dynamic Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ease-in-out opacity-30 scale-110 blur-sm"
        style={{ backgroundImage: `url("${currentSong.cover || '/krishna.jpg'}")` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40 backdrop-blur-3xl"></div> 
      </div>

      {/* Greeting Overlay - GUARANTEED UNMOUNT AFTER ANIMATION */}
      {greetingPhase !== 'gone' && (
        <div 
          className={`absolute z-50 text-center px-4 w-full h-full flex flex-col items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-1000 pointer-events-none 
          ${greetingPhase === 'fading' ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
        >
          <div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-light leading-tight tracking-tight text-white drop-shadow-2xl">
              Welcome back,<br />
              <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mt-2 block">Nitik Rauniyar</span>
            </h1>
            <span className="text-base sm:text-lg md:text-xl mt-6 block text-neutral-300 font-medium tracking-wide">
              Your personal vibe station is ready.
            </span>
          </div>
        </div>
      )}

      {/* Main Music Player Container - ALWAYS VISIBLE FROM START */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 w-full max-w-[26rem] h-full max-h-[850px] flex flex-col justify-center animate-in fade-in zoom-in duration-1000"
      >
        <div className="bg-white/5 backdrop-blur-[40px] border border-white/10 rounded-[2.5rem] p-5 sm:p-7 shadow-2xl shadow-black/50 relative overflow-hidden group flex flex-col gap-4 sm:gap-6 w-full h-auto max-h-full">
          
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

          {/* Header Controls */}
          <div className="flex justify-between items-center relative z-20 shrink-0">
            <button onClick={() => setShowPlaylistMenu(!showPlaylistMenu)} className="text-white/60 hover:text-amber-400 transition-colors p-2 -ml-2 rounded-full hover:bg-white/5 active:scale-95">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span className="text-[9px] sm:text-[10px] font-black tracking-[0.3em] uppercase text-white/40">Vibe Engine</span>
            <div className="flex gap-1 sm:gap-2">
              <button 
                onClick={() => setSpatialAudio(!spatialAudio)} 
                className={`transition-all duration-300 text-[9px] sm:text-[10px] font-bold tracking-widest px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-full border ${spatialAudio ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border-white/10 text-white/40 hover:text-white/80 hover:border-white/30'}`}
              >
                8D
              </button>
              <button 
                onClick={() => setBassBoost(!bassBoost)} 
                className={`transition-all duration-300 text-[9px] sm:text-[10px] font-bold tracking-widest px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-full border ${bassBoost ? 'border-amber-500 text-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'border-white/10 text-white/40 hover:text-white/80 hover:border-white/30'}`}
              >
                BASS
              </button>
            </div>
          </div>

          {/* Playlist Overlay */}
          <div className={`absolute inset-0 bg-neutral-950/95 backdrop-blur-xl z-30 p-5 sm:p-6 overflow-y-auto rounded-[2.5rem] transition-all duration-500 ${showPlaylistMenu ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
            <div className="flex justify-between items-center mb-4 pt-2 px-1 sticky top-0 bg-neutral-950/90 py-3 backdrop-blur-md z-40">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">Your Queue</h3>
              <button onClick={() => setShowPlaylistMenu(false)} className="text-white/60 hover:text-white p-2 rounded-full bg-white/5">✕</button>
            </div>
            <div className="space-y-2 pb-4">
              {playlist.map((song, idx) => (
                <button 
                  key={idx} 
                  onClick={() => { setCurrentSongIndex(idx); setIsPlaying(true); setShowPlaylistMenu(false); }}
                  className={`w-full text-left p-3 sm:p-4 rounded-2xl transition-all flex items-center gap-3 group ${idx === currentSongIndex ? 'bg-gradient-to-r from-amber-500/20 to-transparent border-l-2 border-amber-500' : 'hover:bg-white/5 border-l-2 border-transparent'}`}
                >
                  <img src={song.cover || '/krishna.jpg'} className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover shadow-md" alt="" />
                  <div className="flex-1 overflow-hidden">
                    <div className={`font-bold text-sm sm:text-base truncate ${idx === currentSongIndex ? 'text-amber-400' : 'text-neutral-200 group-hover:text-white'}`}>{song.title}</div>
                    <div className="text-[10px] sm:text-xs text-neutral-500 truncate mt-0.5">{song.artist}</div>
                  </div>
                  {idx === currentSongIndex && isPlaying && (
                    <div className="flex gap-1 items-end h-3 sm:h-4">
                      <div className="w-1 bg-amber-500 animate-[bounce_1s_infinite] h-2"></div>
                      <div className="w-1 bg-amber-500 animate-[bounce_1s_infinite_0.2s] h-3 sm:h-4"></div>
                      <div className="w-1 bg-amber-500 animate-[bounce_1s_infinite_0.4s] h-2.5 sm:h-3"></div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Fluid Vinyl */}
          <div className="relative flex justify-center items-center w-[75%] sm:w-[85%] aspect-square max-w-[280px] mx-auto flex-1 min-h-[180px] shrink">
             <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 pointer-events-none mix-blend-screen opacity-80" />
             <div className={`relative z-10 w-47 h-full rounded-full border-[6px] sm:border-[8px] border-black/80 shadow-[0_15px_40px_rgba(0,0,0,0.5)] overflow-hidden transition-transform duration-[3000ms] ${isPlaying ? 'animate-[spin_8s_linear_infinite]' : 'rotate-0'}`}>
                <div className="absolute inset-0 z-10 rounded-full" style={{ background: 'radial-gradient(circle, transparent 20%, rgba(0,0,0,0.9) 75%, #050505 100%)'}}></div>
                <div className="absolute inset-0 z-10 rounded-full border border-white/5 m-2 mix-blend-overlay"></div>
                <div className="absolute inset-0 z-10 rounded-full border border-white/5 m-4 sm:m-5 mix-blend-overlay"></div>
                <div className="absolute inset-0 z-10 rounded-full border border-white/5 m-7 sm:m-9 mix-blend-overlay"></div>
                
                <div className="absolute inset-0 m-auto w-10 h-10 sm:w-12 sm:h-12 bg-black rounded-full border-[3px] border-neutral-800 z-20 shadow-inner flex items-center justify-center">
                   <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-neutral-700 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]"></div>
                </div>
                
                <img src={currentSong.cover || '/krishna.jpg'} alt="Album Art" className="w-full h-full object-cover rounded-full scale-110 opacity-90 hover:opacity-100 transition-opacity" />
             </div>
          </div>

          {/* Song Info */}
          <div className="text-center px-2 shrink-0">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white mb-1 drop-shadow-md truncate">{currentSong.title}</h2>
            <p className="text-amber-400/80 font-semibold tracking-wider text-[10px] sm:text-xs uppercase truncate">{currentSong.artist}</p>
          </div>

          {/* Progress Bar */}
          <div className="px-1 sm:px-2 shrink-0">
            <div className="relative w-full h-1 sm:h-1.5 bg-neutral-800 rounded-full cursor-pointer overflow-hidden group">
              <input
                type="range" min="0" max={duration || 100} value={currentTime}
                onChange={(e) => { if (audioRef.current) { audioRef.current.currentTime = Number(e.target.value); } }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-200 rounded-full pointer-events-none group-hover:from-amber-500 group-hover:to-white transition-all shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] sm:text-[11px] text-neutral-400 mt-2 sm:mt-3 font-medium font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main Controls */}
          <div className="flex items-center justify-between px-1 shrink-0">
            <button onClick={() => setIsShuffle(!isShuffle)} className={`transition-all p-2 sm:p-3 rounded-full active:scale-90 ${isShuffle ? 'text-amber-400 bg-amber-400/10' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}>
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
            
            <div className="flex items-center gap-3 sm:gap-5">
              <button onClick={playPrev} className="text-white/70 hover:text-amber-400 transition-all active:scale-75 p-2"><svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg></button>
              
              <button onClick={togglePlayPause} className="relative group flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20">
                <div className="absolute inset-0 bg-amber-400 rounded-full blur-md opacity-30 group-hover:opacity-60 transition-opacity duration-300"></div>
                <div className="relative z-10 bg-gradient-to-br from-amber-300 to-amber-600 text-black rounded-full w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
                  {isPlaying 
                    ? <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                    : <svg className="w-6 h-6 sm:w-7 sm:h-7 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg>
                  }
                </div>
              </button>
              
              <button onClick={playNext} className="text-white/70 hover:text-amber-400 transition-all active:scale-75 p-2"><svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg></button>
            </div>

            <button onClick={() => setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')} className={`transition-all p-2 sm:p-3 rounded-full active:scale-90 ${repeatMode !== 'none' ? 'text-amber-400 bg-amber-400/10' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}>
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {repeatMode === 'one' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                )}
              </svg>
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex justify-center mt-1 sm:mt-2 items-center gap-2 sm:gap-3 opacity-60 hover:opacity-100 transition-opacity duration-300 px-2 sm:px-4 shrink-0">
            <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
            <div className="flex-1 h-1 sm:h-1.5 bg-neutral-800 rounded-full relative flex items-center group/vol">
              <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setIsMuted(false); }} className="w-full h-full bg-transparent appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 sm:[&::-webkit-slider-thumb]:w-3 sm:[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full cursor-pointer z-10" />
              <div className="absolute left-0 top-0 bottom-0 bg-white rounded-full pointer-events-none transition-all" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}></div>
            </div>
          </div>

        </div>

        <audio
          ref={audioRef}
          src={currentSong?.src || undefined}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          crossOrigin="anonymous" 
        />
      </div>
    </main>
  );
}