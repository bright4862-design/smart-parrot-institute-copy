import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  CreditCard,
  HelpCircle,
  MapPin,
  RotateCcw,
  Sparkles,
  Star,
  TrainFront,
  X,
} from 'lucide-react';

const stages = [
  { id: 'arrival', label: 'Arrivals' },
  { id: 'sign', label: 'Underground' },
  { id: 'gate', label: 'Ticket gate' },
  { id: 'platform', label: 'Platform' },
];

const helpCopy = {
  fr: {
    name: 'Français',
    arrival: 'Tu viens d’atterrir à Heathrow. Entre dans le terminal et cherche les panneaux du métro.',
    sign: 'Choisis le panneau « Underground ». C’est le métro de Londres.',
    gate: 'Pose ta carte bancaire sans contact sur le lecteur jaune.',
    platform: 'Monte dans le train de la Piccadilly line vers le centre de Londres.',
    complete: 'Mission réussie : tu as trouvé le métro et rejoint Londres.',
  },
  ar: {
    name: 'العربية',
    arrival: 'لقد وصلت إلى مطار هيثرو. ادخل مبنى المطار وابحث عن إشارات مترو الأنفاق.',
    sign: 'اختر علامة Underground. هذا هو مترو لندن.',
    gate: 'المس البطاقة البنكية اللاتلامسية بالقارئ الأصفر.',
    platform: 'اصعد إلى قطار خط بيكاديللي المتجه إلى وسط لندن.',
    complete: 'أكملت المهمة: وجدت المترو ووصلت إلى لندن.',
  },
};

function Progress({ stage }) {
  const active = stages.findIndex((item) => item.id === stage);
  return (
    <div className="mx-auto flex max-w-3xl items-center gap-2 px-2">
      {stages.map((item, index) => (
        <React.Fragment key={item.id}>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <motion.div
              animate={{ scale: index === active ? 1.12 : 1 }}
              className={`grid h-10 w-10 place-items-center rounded-full border-2 text-xs font-black shadow-lg ${index <= active ? 'border-amber-200 bg-gradient-to-br from-amber-300 to-orange-500 text-white' : 'border-white/70 bg-white/60 text-slate-400'}`}
            >
              {index < active ? <Check className="h-4 w-4" /> : index + 1}
            </motion.div>
            <span className="truncate text-[10px] font-black text-white drop-shadow sm:text-xs">{item.label}</span>
          </div>
          {index < stages.length - 1 && <div className={`mb-6 h-1 flex-1 rounded-full ${index < active ? 'bg-amber-300' : 'bg-white/30'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function ParrotGuide({ message }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-5 left-5 z-30 flex max-w-[88%] items-end gap-3 sm:max-w-xl">
      <motion.div animate={{ y: [0, -7, 0], rotate: [-2, 2, -2] }} transition={{ duration: 2.8, repeat: Infinity }} className="relative grid h-24 w-20 shrink-0 place-items-center rounded-[42%_55%_48%_52%] bg-gradient-to-br from-emerald-300 via-emerald-500 to-teal-700 shadow-2xl ring-4 ring-white/70">
        <div className="absolute -right-2 top-7 h-5 w-9 rounded-full bg-amber-300" />
        <div className="absolute left-4 top-5 h-4 w-4 rounded-full bg-white"><div className="m-1 h-2 w-2 rounded-full bg-slate-900" /></div>
        <div className="absolute -left-3 bottom-5 h-9 w-7 rotate-[-18deg] rounded-full bg-emerald-700" />
        <div className="absolute -bottom-3 left-4 h-8 w-3 rotate-12 rounded-full bg-teal-800" />
        <div className="absolute -bottom-3 right-4 h-8 w-3 -rotate-12 rounded-full bg-teal-800" />
      </motion.div>
      <div className="rounded-[26px] rounded-bl-md border border-white/60 bg-slate-950/90 p-5 text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-amber-300"><Sparkles className="h-4 w-4" /> Pico says</div>
        <p className="font-semibold leading-6 text-slate-100">{message}</p>
      </div>
    </motion.div>
  );
}

function HelpPanel({ stage, complete, close }) {
  const [language, setLanguage] = useState('fr');
  const key = complete ? 'complete' : stage;
  return (
    <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[30px] border border-white/60 bg-white/90 p-5 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-6 sm:top-6 sm:bottom-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-black"><HelpCircle className="h-5 w-5 text-violet-600" /> Need a hint?</div>
        <button onClick={close} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 text-sm text-slate-500">The adventure stays in English. Use a quick explanation only when needed.</p>
      <div className="mt-4 flex gap-2">
        {Object.entries(helpCopy).map(([code, item]) => <button key={code} onClick={() => setLanguage(code)} className={`rounded-full px-4 py-2 text-sm font-black ${language === code ? 'bg-violet-600 text-white' : 'bg-slate-100'}`}>{item.name}</button>)}
      </div>
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="mt-4 rounded-2xl bg-slate-950 p-4 text-sm font-semibold leading-7 text-white">{helpCopy[language][key]}</div>
    </motion.aside>
  );
}

export default function LondonMission() {
  const [stageIndex, setStageIndex] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [tapped, setTapped] = useState(false);
  const [complete, setComplete] = useState(false);
  const [help, setHelp] = useState(false);
  const stage = stages[stageIndex]?.id || 'arrival';

  const advance = () => {
    setAnswer(null);
    if (stageIndex === stages.length - 1) setComplete(true);
    else setStageIndex((value) => value + 1);
  };

  const restart = () => {
    setStageIndex(0);
    setAnswer(null);
    setTapped(false);
    setComplete(false);
    setHelp(false);
  };

  const chooseSign = (choice) => {
    setAnswer(choice);
    if (choice === 'underground') window.setTimeout(advance, 850);
  };

  const tapCard = () => {
    if (tapped) return;
    setTapped(true);
    window.setTimeout(advance, 1200);
  };

  const guideMessage = {
    arrival: 'Welcome to London! Follow me through the glowing terminal and let’s find the quickest route into the city.',
    sign: 'Airport signs are your first real-world challenge. Look for the famous red-and-blue Underground symbol.',
    gate: 'Londoners tap in with contactless cards. Touch the yellow reader and listen for the beep!',
    platform: 'You need the Piccadilly line toward central London. Check the destination before you board.',
  }[stage];

  return (
    <main className="min-h-screen overflow-hidden bg-[#15152b] px-3 py-4 text-slate-950 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-3 text-white">
          <div>
            <div className="flex items-center gap-2 text-sm font-black tracking-[0.18em] text-amber-300"><Sparkles className="h-4 w-4" /> SMART PARROT</div>
            <div className="mt-1 text-xl font-black">London Adventure · A1</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setHelp(true)} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur"><HelpCircle className="h-4 w-4" /> Help</button>
            <button onClick={restart} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur"><RotateCcw className="h-4 w-4" /> Restart</button>
          </div>
        </div>

        {!complete && <Progress stage={stage} />}

        <div className="mt-5">
          <AnimatePresence mode="wait">
            {complete ? (
              <motion.section key="complete" initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} className="relative grid min-h-[690px] overflow-hidden rounded-[38px] border border-white/20 bg-gradient-to-b from-indigo-700 via-violet-700 to-fuchsia-900 p-8 text-center text-white shadow-2xl">
                <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 0 2px, transparent 3px), radial-gradient(circle at 80% 30%, white 0 2px, transparent 3px), radial-gradient(circle at 55% 70%, white 0 2px, transparent 3px)', backgroundSize: '120px 120px' }} />
                <div className="relative z-10 m-auto">
                  <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 1.5 }} className="mx-auto grid h-44 w-44 place-items-center rounded-full border-8 border-amber-200 bg-gradient-to-br from-amber-300 to-orange-500 text-7xl shadow-2xl">🦜</motion.div>
                  <p className="mt-8 text-xs font-black tracking-[.24em] text-amber-300">PASSPORT STAMP EARNED</p>
                  <h1 className="mt-3 text-4xl font-black sm:text-6xl">Welcome to London</h1>
                  <p className="mx-auto mt-4 max-w-xl text-lg text-violet-100">You found the Underground, tapped through the gate and boarded the Piccadilly line.</p>
                  <div className="mx-auto mt-7 flex w-fit flex-wrap justify-center gap-3">
                    <span className="rounded-full bg-white/15 px-5 py-3 font-black">+40 XP</span>
                    <span className="rounded-full bg-white/15 px-5 py-3 font-black">Soho unlocked</span>
                    <span className="rounded-full bg-white/15 px-5 py-3 font-black">Travel badge earned</span>
                  </div>
                  <button onClick={restart} className="mt-8 rounded-full bg-white px-7 py-3 font-black text-violet-900 shadow-xl">Play again</button>
                </div>
              </motion.section>
            ) : (
              <motion.section key={stage} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="relative min-h-[690px] overflow-hidden rounded-[38px] border border-white/30 bg-gradient-to-b from-sky-300 via-cyan-100 to-amber-100 shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,.85),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,.5),transparent_25%)]" />
                <div className="absolute left-5 top-5 z-20 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-black tracking-[.18em] text-slate-700 shadow-lg backdrop-blur">HEATHROW T5</div>
                <div className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-black text-violet-700 shadow-lg backdrop-blur"><Star className="h-4 w-4 fill-amber-300 text-amber-400" /> 120 XP</div>

                <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-b from-slate-300 to-slate-500">
                  <div className="h-3 bg-amber-400" />
                  <div className="absolute inset-x-0 top-24 h-4 bg-white/50" />
                  <div className="absolute inset-x-0 top-44 h-2 bg-slate-700/40" />
                </div>

                {stage === 'arrival' && <div className="absolute inset-0">
                  <div className="absolute inset-x-0 top-24 mx-auto h-52 max-w-4xl rounded-[40px] border-8 border-white/70 bg-gradient-to-b from-sky-200 to-white/90 shadow-2xl">
                    <div className="absolute inset-x-8 top-8 h-3 rounded-full bg-white/80" />
                    <div className="absolute inset-x-12 bottom-6 flex justify-between">
                      {[0,1,2,3,4].map((item) => <div key={item} className="h-20 w-16 rounded-t-3xl bg-sky-700/20 ring-4 ring-white/60" />)}
                    </div>
                  </div>
                  <motion.div initial={{ x: '-30%' }} animate={{ x: '120%' }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} className="absolute top-16 text-6xl drop-shadow-xl">✈️</motion.div>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .98 }} onClick={advance} className="absolute bottom-40 right-5 z-20 inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 font-black text-white shadow-2xl sm:right-10">Enter the terminal <ArrowRight className="h-5 w-5" /></motion.button>
                  <ParrotGuide message={guideMessage} />
                </div>}

                {stage === 'sign' && <div className="absolute inset-0 px-5 pt-24">
                  <div className="mx-auto max-w-xl text-center"><p className="text-xs font-black tracking-[.2em] text-violet-700">FIND YOUR WAY</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Which sign takes you to the Tube?</h1><p className="mt-2 font-semibold text-slate-600">Tap the correct airport sign.</p></div>
                  <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
                    <motion.button whileHover={{ y: -4 }} onClick={() => chooseSign('parking')} className={`rounded-[28px] border-4 bg-white/90 p-6 text-left shadow-2xl backdrop-blur ${answer === 'parking' ? 'border-rose-500' : 'border-white'}`}><div className="text-5xl">🅿️</div><div className="mt-4 text-xl font-black">Car park</div><div className="text-sm text-slate-500">Parking and rentals</div></motion.button>
                    <motion.button whileHover={{ y: -4 }} onClick={() => chooseSign('underground')} className={`rounded-[28px] border-4 bg-white/90 p-6 text-left shadow-2xl backdrop-blur ${answer === 'underground' ? 'border-emerald-500' : 'border-white'}`}><div className="relative grid h-16 w-16 place-items-center rounded-full border-[9px] border-red-600"><div className="absolute h-4 w-24 bg-blue-700" /></div><div className="mt-4 text-xl font-black">Underground</div><div className="text-sm text-slate-500">Trains to central London</div></motion.button>
                  </div>
                  {answer === 'parking' && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center font-black text-rose-600">Not this way — look for the Underground roundel.</motion.p>}
                  <ParrotGuide message={guideMessage} />
                </div>}

                {stage === 'gate' && <div className="absolute inset-0 px-5 pt-20">
                  <div className="text-center"><p className="text-xs font-black tracking-[.2em] text-violet-700">PAY AND ENTER</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Tap your contactless card</h1><p className="mt-2 font-semibold text-slate-600">Touch the glowing yellow reader.</p></div>
                  <div className="relative mx-auto mt-10 h-80 max-w-xl">
                    <div className="absolute bottom-0 left-1/2 h-56 w-80 -translate-x-1/2 rounded-t-[48px] bg-gradient-to-b from-slate-600 to-slate-900 shadow-2xl ring-4 ring-white/30">
                      <motion.button animate={tapped ? { scale: [1, 1.18, 1], boxShadow: ['0 0 0px #facc15', '0 0 45px #facc15', '0 0 0px #facc15'] } : { scale: [1, 1.05, 1] }} transition={{ duration: 1.4, repeat: tapped ? 0 : Infinity }} onClick={tapCard} className="absolute left-1/2 top-8 grid h-28 w-28 -translate-x-1/2 place-items-center rounded-[30px] bg-gradient-to-br from-yellow-200 to-amber-500 shadow-xl"><CreditCard className="h-12 w-12 text-slate-800" /></motion.button>
                      <motion.div animate={{ rotateY: tapped ? 70 : 0 }} className="absolute -left-10 bottom-16 h-28 w-24 origin-right rounded-xl bg-sky-200/80 ring-4 ring-white/50" />
                      <motion.div animate={{ rotateY: tapped ? -70 : 0 }} className="absolute -right-10 bottom-16 h-28 w-24 origin-left rounded-xl bg-sky-200/80 ring-4 ring-white/50" />
                    </div>
                    {tapped && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-emerald-500 px-5 py-3 font-black text-white shadow-xl">Beep! Gate open ✨</motion.div>}
                  </div>
                  <ParrotGuide message={guideMessage} />
                </div>}

                {stage === 'platform' && <div className="absolute inset-0 px-5 pt-20">
                  <div className="text-center"><p className="text-xs font-black tracking-[.2em] text-violet-700">PICCADILLY LINE</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Board the train to central London</h1><p className="mt-2 font-semibold text-slate-600">Choose the train marked Piccadilly line.</p></div>
                  <div className="relative mt-16 h-72 overflow-hidden">
                    <div className="absolute inset-x-0 bottom-0 h-5 bg-slate-800" />
                    <motion.button initial={{ x: '110%' }} animate={{ x: '3%' }} transition={{ duration: 2, ease: 'easeOut' }} onClick={advance} className="absolute bottom-5 flex h-48 w-[94%] items-center overflow-hidden rounded-[44px] border-8 border-blue-900 bg-gradient-to-b from-white to-slate-200 px-7 text-left shadow-2xl">
                      <div className="absolute inset-x-0 bottom-0 h-7 bg-blue-800" />
                      <TrainFront className="h-20 w-20 shrink-0 text-blue-900" />
                      <div className="ml-5"><div className="text-xs font-black tracking-[.18em] text-blue-700">PICCADILLY LINE</div><div className="mt-2 text-xl font-black sm:text-2xl">Cockfosters via Central London</div><div className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-500"><MapPin className="h-4 w-4" /> Tap to board</div></div>
                      <div className="ml-auto hidden gap-3 lg:flex">{[0,1,2].map((item) => <div key={item} className="h-20 w-24 rounded-2xl bg-sky-200 ring-4 ring-slate-700" />)}</div>
                    </motion.button>
                  </div>
                  <ParrotGuide message={guideMessage} />
                </div>}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>{help && <HelpPanel stage={stage} complete={complete} close={() => setHelp(false)} />}</AnimatePresence>
    </main>
  );
}
