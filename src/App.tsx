/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Users, 
  MapPin, 
  Settings, 
  Eye, 
  Send, 
  Plus, 
  Trash2, 
  ExternalLink, 
  X,
  Camera,
  Heart,
  Home,
  Cloud,
  Trees
} from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface SpecialSpot {
  id: string;
  km: number;
  imageUrl: string;
  text: string;
  link: string;
}

interface Message {
  id: string;
  nickname: string;
  text: string;
  timestamp: number;
}

// --- Default Data ---
const DEFAULT_SPOTS: SpecialSpot[] = [
  { id: '1', km: 40, imageUrl: 'https://picsum.photos/seed/barabom1/400/300', text: '첫 번째 마을에 도착했습니다! 따뜻한 미소를 담았습니다.', link: 'https://barabom.org' },
  { id: '2', km: 100, imageUrl: 'https://picsum.photos/seed/barabom2/400/300', text: '숲속 마을의 반환점! 우리의 여정은 계속됩니다.', link: 'https://barabom.org' },
  { id: '3', km: 160, imageUrl: 'https://picsum.photos/seed/barabom3/400/300', text: '바닷가 마을이 보입니다. 160명의 삶을 기록했습니다.', link: 'https://barabom.org' },
];

export default function App() {
  return (
    <BrowserRouter>
      <MainApp />
    </BrowserRouter>
  );
}

function MainApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPath = location.pathname === '/admin';

  // --- State ---
  const [distance, setDistance] = useState(45);
  const [supporters, setSupporters] = useState(128);
  const [specialSpots, setSpecialSpots] = useState<SpecialSpot[]>(DEFAULT_SPOTS);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', nickname: '행복이', text: '나종민 대표님 응원합니다! 👨‍👦', timestamp: Date.now() },
    { id: '2', nickname: '마을주민', text: '마을마다 행복이 가득하길! 🏠', timestamp: Date.now() },
    { id: '3', nickname: '바라봄팬', text: '바라봄 사진관 화이팅! 📸', timestamp: Date.now() },
  ]);
  const [selectedSpot, setSelectedSpot] = useState<SpecialSpot | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [nickname, setNickname] = useState('');

  // --- Persistence ---
  useEffect(() => {
    const savedData = localStorage.getItem('barabom_campaign_data_v2');
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setDistance(parsed.distance || 0);
      setSupporters(parsed.supporters || 0);
      setSpecialSpots(parsed.specialSpots || DEFAULT_SPOTS);
      setMessages(parsed.messages || []);
    }
  }, []);

  useEffect(() => {
    const data = { distance, supporters, specialSpots, messages };
    localStorage.setItem('barabom_campaign_data_v2', JSON.stringify(data));
  }, [distance, supporters, specialSpots, messages]);

  // --- Handlers ---
  const handleAddMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !nickname.trim()) return;
    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      nickname: nickname.trim(),
      text: newMessage.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [msg, ...prev].slice(0, 20));
    setNewMessage('');
    setNickname('');
  };

  const handleAddSpot = (spot: Omit<SpecialSpot, 'id'>) => {
    const newSpot: SpecialSpot = {
      ...spot,
      id: Math.random().toString(36).substr(2, 9),
    };
    setSpecialSpots(prev => [...prev, newSpot].sort((a, b) => a.km - b.km));
  };

  const handleDeleteSpot = (id: string) => {
    setSpecialSpots(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F0F9FF] text-slate-800 font-sans selection:bg-orange-200 overflow-x-hidden">
      {/* --- Background Elements --- */}
      <div className="fixed inset-0 pointer-events-none opacity-20 overflow-hidden">
        <Cloud className="absolute top-20 left-[10%] text-white" size={120} />
        <Cloud className="absolute top-40 right-[15%] text-white" size={100} />
        <Cloud className="absolute top-80 left-[25%] text-white" size={80} />
        <div className="absolute bottom-0 left-0 w-full h-64 bg-emerald-100/50 rounded-[100%_100%_0_0] translate-y-32" />
      </div>

      {/* --- Header --- */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-orange-100 px-4 py-3 md:px-8 flex justify-between items-center shadow-sm">
        <Link to="/" className="flex items-center gap-3">
          <motion.div 
            whileHover={{ rotate: 10 }}
            className="w-10 h-10 bg-orange-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-100"
          >
            <Camera size={24} />
          </motion.div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-900 leading-tight tracking-tight">바라봄 포토런</h1>
            <p className="text-[10px] md:text-xs text-orange-500 font-bold uppercase tracking-wider">200명의 이웃을 향한 굽이굽이 여정</p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {!isAdminPath && (
            <div className="hidden md:flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-orange-100 shadow-sm">
              <Users size={16} className="text-orange-400" />
              <span className="text-sm font-bold text-slate-600">
                <span className="text-orange-500 tabular-nums">{supporters.toLocaleString()}</span>명의 친구들과 함께!
              </span>
            </div>
          )}
          
          <button 
            onClick={() => navigate(isAdminPath ? '/' : '/admin')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition-all shadow-sm ${
              isAdminPath 
                ? 'bg-slate-800 text-white hover:bg-slate-700' 
                : 'bg-orange-400 text-white hover:bg-orange-500 hover:shadow-orange-200'
            }`}
          >
            {isAdminPath ? <Eye size={16} /> : <Settings size={16} />}
            {isAdminPath ? '마을 구경하기' : '관리자'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12 pb-40 relative z-10">
        <Routes>
          <Route path="/" element={
            <UserView 
              distance={distance} 
              specialSpots={specialSpots} 
              onSpotClick={setSelectedSpot}
              supporters={supporters}
            />
          } />
          <Route path="/admin" element={
            <AdminPanel 
              distance={distance} 
              setDistance={setDistance} 
              supporters={supporters} 
              setSupporters={setSupporters}
              specialSpots={specialSpots}
              onAddSpot={handleAddSpot}
              onDeleteSpot={handleDeleteSpot}
            />
          } />
        </Routes>
      </main>

      {/* --- Floating Messages (Marquee) --- */}
      {!isAdminPath && (
        <div className="fixed bottom-0 left-0 w-full z-30">
          <div className="bg-white/80 backdrop-blur-md border-t border-orange-100 pt-2 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
            <div className="relative overflow-hidden h-10 flex items-center mb-2">
              <div className="flex whitespace-nowrap animate-marquee">
                {[...messages, ...messages].map((msg, idx) => (
                  <span key={`${msg.id}-${idx}`} className="mx-10 text-sm font-bold text-slate-500 flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-400 rounded-full" />
                    <span className="text-orange-500 font-black">[{msg.nickname}]</span> {msg.text}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="px-4 max-w-3xl mx-auto">
              <form onSubmit={handleAddMessage} className="flex flex-col md:flex-row gap-2 bg-orange-50 p-1.5 rounded-[2rem] md:rounded-full border-2 border-orange-100 shadow-inner">
                <input 
                  type="text" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임"
                  className="w-full md:w-32 bg-white/50 px-5 py-2 text-sm font-bold focus:outline-none placeholder:text-orange-300 rounded-full"
                />
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="따뜻한 응원을 보내주세요! ✨"
                  className="flex-1 bg-transparent px-5 py-2 text-sm font-medium focus:outline-none placeholder:text-orange-300"
                />
                <button 
                  type="submit"
                  className="bg-orange-400 text-white px-8 py-2 rounded-full font-black text-sm hover:bg-orange-500 transition-all shadow-md shadow-orange-100 active:scale-95 whitespace-nowrap"
                >
                  보내기
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal --- */}
      <AnimatePresence>
        {selectedSpot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotate: 2 }}
              className="bg-white rounded-[3rem] overflow-hidden shadow-2xl max-w-md w-full relative border-8 border-orange-50"
            >
              <button 
                onClick={() => setSelectedSpot(null)}
                className="absolute top-6 right-6 z-10 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="p-2">
                <img 
                  src={selectedSpot.imageUrl} 
                  alt="Special Spot" 
                  className="w-full h-64 object-cover rounded-[2.5rem]"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="p-8 pt-4 text-center">
                <div className="inline-block bg-orange-100 text-orange-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest mb-4">
                  📍 {selectedSpot.km}KM VILLAGE
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-6 leading-tight">
                  {selectedSpot.text}
                </h3>
                
                <a 
                  href={selectedSpot.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-orange-400 text-white px-8 py-4 rounded-2xl font-black hover:bg-orange-500 transition-all shadow-lg shadow-orange-100 active:scale-95"
                >
                  이야기 더 보기
                  <ExternalLink size={18} />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 50s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

// --- Sub-Components ---

function UserView({ distance, specialSpots, onSpotClick, supporters }: any) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [charPos, setCharPos] = useState({ x: 0, y: 0 });
  const [spotPositions, setSpotPositions] = useState<any[]>([]);

  // Winding path definition
  const pathD = "M 50 100 C 150 100, 200 300, 400 300 C 600 300, 650 100, 850 100 C 1050 100, 1100 300, 1300 300 C 1500 300, 1550 100, 1750 100";
  
  useEffect(() => {
    if (pathRef.current) {
      const path = pathRef.current;
      const totalLength = path.getTotalLength();
      
      // Calculate character position
      const charLength = (distance / 200) * totalLength;
      const point = path.getPointAtLength(charLength);
      setCharPos({ x: point.x, y: point.y });

      // Calculate spot positions
      const spots = specialSpots.map((spot: any) => {
        const spotLength = (spot.km / 200) * totalLength;
        const pActual = path.getPointAtLength(spotLength);
        return { ...spot, x: pActual.x, y: pActual.y };
      });
      setSpotPositions(spots);
    }
  }, [distance, specialSpots]);

  return (
    <div className="space-y-16">
      <section className="text-center space-y-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-block bg-white px-6 py-2 rounded-full border-2 border-orange-100 shadow-sm text-orange-500 font-black text-sm"
        >
          지금 우리 마을은 🏠
        </motion.div>
        <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-none">
          나종민 대표님이 <br />
          <span className="text-orange-400 underline decoration-orange-100 underline-offset-8">{distance}km</span> 지점을 지나요!
        </h2>
        <p className="text-slate-500 max-w-lg mx-auto font-medium leading-relaxed">
          굽이굽이 마을 길을 따라 200명의 이웃을 만나는 따뜻한 여정입니다. 
          마을 곳곳에 숨겨진 이야기를 찾아보세요!
        </p>
      </section>

      {/* --- Winding Road Map --- */}
      <div className="relative bg-emerald-50/30 rounded-[4rem] p-8 md:p-12 border-4 border-white shadow-xl overflow-hidden min-h-[400px]">
        {/* Decorative Village Elements */}
        <div className="absolute top-10 left-20 text-4xl opacity-40">🏠</div>
        <div className="absolute top-40 right-40 text-4xl opacity-40">🌳</div>
        <div className="absolute bottom-20 left-40 text-4xl opacity-40">🏡</div>
        <div className="absolute bottom-10 right-20 text-4xl opacity-40">🌲</div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl opacity-5 pointer-events-none font-black">VILLAGE</div>

        <svg 
          ref={svgRef}
          viewBox="0 0 1800 400" 
          className="w-full h-auto drop-shadow-sm"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background Road (Shadow) */}
          <path 
            d={pathD} 
            fill="none" 
            stroke="#E2E8F0" 
            strokeWidth="24" 
            strokeLinecap="round" 
          />
          {/* Main Road */}
          <path 
            ref={pathRef}
            d={pathD} 
            fill="none" 
            stroke="#FDBA74" 
            strokeWidth="16" 
            strokeLinecap="round" 
            strokeDasharray="1, 20"
          />
          {/* Progress Path */}
          <motion.path 
            d={pathD} 
            fill="none" 
            stroke="#FB923C" 
            strokeWidth="16" 
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: distance / 200 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />

          {/* Start and Goal Markers */}
          <g>
            <circle cx="50" cy="100" r="10" fill="#FB923C" />
            <text x="50" y="70" textAnchor="middle" className="text-[20px] font-black fill-orange-500">START 🏁</text>
          </g>
          <g>
            <circle cx="1750" cy="100" r="10" fill="#FB923C" />
            <text x="1750" y="70" textAnchor="middle" className="text-[20px] font-black fill-orange-500">GOAL 🏆</text>
          </g>

          {/* Markers */}
          {spotPositions.map((spot) => (
            <g 
              key={spot.id} 
              className="cursor-pointer group"
              onClick={() => onSpotClick(spot)}
            >
              <circle 
                cx={spot.x} 
                cy={spot.y} 
                r="12" 
                fill={distance >= spot.km ? "#FB923C" : "white"} 
                stroke="#FB923C" 
                strokeWidth="4"
                className="transition-colors duration-500"
              />
              <text 
                x={spot.x} 
                y={spot.y - 30} 
                textAnchor="middle" 
                className="text-[24px] font-black fill-slate-400 group-hover:fill-orange-500 transition-colors"
              >
                📍
              </text>
              <text 
                x={spot.x} 
                y={spot.y + 40} 
                textAnchor="middle" 
                className="text-[18px] font-bold fill-slate-400 group-hover:fill-orange-500 transition-colors"
              >
                {spot.km}km
              </text>
            </g>
          ))}

          {/* Character */}
          <g transform={`translate(${charPos.x - 40}, ${charPos.y - 80})`}>
            <foreignObject width="80" height="100">
              <div className="flex flex-col items-center">
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="text-6xl drop-shadow-lg select-none"
                >
                  👨‍👦
                </motion.div>
                <div className="mt-1 bg-slate-800 text-white text-[12px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                  나종민 & 아들
                </div>
              </div>
            </foreignObject>
          </g>
        </svg>
      </div>

      {/* CTA Button Section */}
      <section className="flex justify-center py-4">
        <motion.a 
          href="https://barabom.org/donation" 
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-orange-500 text-white px-10 py-6 rounded-[2.5rem] text-xl md:text-2xl font-black shadow-xl shadow-orange-200 flex items-center gap-4 hover:bg-orange-600 transition-all"
        >
          <Heart className="fill-white" size={32} />
          3만원으로 여정에 함께하기
          <ExternalLink size={24} />
        </motion.a>
      </section>

      {/* Stats Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[3rem] border-4 border-orange-50 shadow-sm hover:shadow-orange-100 transition-all group">
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-500 mb-6 group-hover:rotate-12 transition-transform">
            <Camera size={28} />
          </div>
          <h4 className="text-xl font-black text-slate-900 mb-3">200명의 미소</h4>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            마을 구석구석 숨겨진 이웃들의 가장 빛나는 순간을 사진에 담습니다.
          </p>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border-4 border-orange-50 shadow-sm hover:shadow-orange-100 transition-all group">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 group-hover:rotate-12 transition-transform">
            <Trees size={28} />
          </div>
          <h4 className="text-xl font-black text-slate-900 mb-3">굽이굽이 200km</h4>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            포장된 길보다 따뜻한 사람 냄새가 나는 마을 길을 따라 걷습니다.
          </p>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border-4 border-orange-50 shadow-sm hover:shadow-orange-100 transition-all group">
          <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-500 mb-6 group-hover:rotate-12 transition-transform">
            <Heart size={28} />
          </div>
          <h4 className="text-xl font-black text-slate-900 mb-3">함께 걷는 친구들</h4>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            {supporters}명의 친구들이 보내주신 응원이 이 길을 밝혀줍니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ 
  distance, 
  setDistance, 
  supporters, 
  setSupporters, 
  specialSpots, 
  onAddSpot, 
  onDeleteSpot 
}: any) {
  const [newSpot, setNewSpot] = useState({ km: 0, imageUrl: '', text: '', link: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewSpot(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitSpot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpot.imageUrl || !newSpot.text) return;
    onAddSpot(newSpot);
    setNewSpot({ km: 0, imageUrl: '', text: '', link: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-10">
      <section className="bg-white p-10 rounded-[3rem] border-4 border-slate-100 shadow-sm">
        <h2 className="text-3xl font-black text-slate-900 mb-8 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-xl text-orange-500">
            <Settings size={24} />
          </div>
          마을 여정 업데이트
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <label className="block text-sm font-black text-slate-700 uppercase tracking-widest">현재 진행 거리 (km)</label>
            <div className="flex items-center gap-6">
              <input 
                type="range" 
                min="0" 
                max="200" 
                value={distance} 
                onChange={(e) => setDistance(Number(e.target.value))}
                className="flex-1 h-3 bg-slate-100 rounded-full appearance-none cursor-pointer accent-orange-400"
              />
              <div className="bg-orange-50 border-2 border-orange-100 rounded-2xl px-5 py-3 text-2xl font-black text-orange-500 tabular-nums">
                {distance}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <label className="block text-sm font-black text-slate-700 uppercase tracking-widest">실시간 후원자 수</label>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                value={supporters} 
                onChange={(e) => setSupporters(Number(e.target.value))}
                className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-xl font-black focus:outline-none focus:border-orange-200"
              />
              <div className="text-slate-400 font-bold">FRIENDS</div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white p-10 rounded-[3rem] border-4 border-slate-100 shadow-sm">
        <h2 className="text-3xl font-black text-slate-900 mb-8 flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-xl text-emerald-500">
            <MapPin size={24} />
          </div>
          마을 스팟 추가하기
        </h2>

        <form onSubmit={handleSubmitSpot} className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">위치 (km)</label>
            <input 
              type="number" 
              placeholder="예: 50"
              value={newSpot.km}
              onChange={(e) => setNewSpot({...newSpot, km: Number(e.target.value)})}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold focus:outline-none focus:border-orange-200"
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">마을 사진 (파일 첨부)</label>
            <div className="relative">
              <input 
                type="file" 
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label 
                htmlFor="file-upload"
                className="flex items-center gap-3 w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl px-6 py-4 font-bold cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-all text-slate-500"
              >
                <Camera size={20} />
                {newSpot.imageUrl ? '사진이 선택되었습니다 ✅' : '사진 파일을 선택해주세요'}
              </label>
            </div>
            {newSpot.imageUrl && (
              <div className="mt-2 relative inline-block">
                <img src={newSpot.imageUrl} alt="Preview" className="w-32 h-24 object-cover rounded-xl border-2 border-orange-100" />
                <button 
                  type="button"
                  onClick={() => setNewSpot(prev => ({ ...prev, imageUrl: '' }))}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3 md:col-span-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">마을 이야기 (설명)</label>
            <textarea 
              placeholder="이 마을에서 만난 이웃의 이야기를 들려주세요."
              value={newSpot.text}
              onChange={(e) => setNewSpot({...newSpot, text: e.target.value})}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold focus:outline-none focus:border-orange-200 h-32 resize-none"
            />
          </div>
          <div className="space-y-3 md:col-span-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">외부 링크 (선택)</label>
            <input 
              type="text" 
              placeholder="https://..."
              value={newSpot.link}
              onChange={(e) => setNewSpot({...newSpot, link: e.target.value})}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold focus:outline-none focus:border-orange-200"
            />
          </div>
          <button 
            type="submit"
            className="md:col-span-2 bg-orange-400 text-white font-black py-5 rounded-[2rem] hover:bg-orange-500 transition-all shadow-lg shadow-orange-100 active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus size={24} />
            새로운 마을 스팟 등록
          </button>
        </form>

        <div className="space-y-6">
          <h3 className="text-xl font-black text-slate-700">우리 마을 지도 목록</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {specialSpots.map((spot: SpecialSpot) => (
              <div key={spot.id} className="flex items-center gap-6 p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 group">
                <img src={spot.imageUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-sm" referrerPolicy="no-referrer" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-black text-slate-900">{spot.km}km 지점</div>
                  <div className="text-sm text-slate-500 font-medium truncate">{spot.text}</div>
                </div>
                <button 
                  onClick={() => onDeleteSpot(spot.id)}
                  className="p-3 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-full transition-all"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
            {specialSpots.length === 0 && (
              <div className="md:col-span-2 py-16 text-center text-slate-400 font-bold italic bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                아직 등록된 마을 이야기가 없어요. 🏠
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
