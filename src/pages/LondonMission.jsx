import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, CreditCard, HelpCircle, MapPin, RotateCcw, TrainFront, X } from 'lucide-react';

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
            <div className={`grid h-9 w-9 place-items-center rounded-full border text-xs font-black ${index <= active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-400'}`}>
              {index < active ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <span className="truncate text-[10px] font-bold text-slate-600 sm:text-xs">{item.label}</span>
          </div>
          {index < stages.length - 1 && <div className={`mb-6 h-1 flex-1 rounded-full ${index < active ? 'bg-blue-600' : 'bg-slate-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function HelpPanel({ stage, complete, close }) {
  const [language, setLanguage] = useState('fr');
  const key = complete ? 'complete' : stage;
  return (
    <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[28px] bg-white/95 p-5 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-6 sm:top-6 sm:bottom-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-black"><HelpCircle className="h-5 w-5 text-blue-600" /> Need help?</div>
        <button onClick={close} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 text-sm text-slate-500">Gameplay stays in English. Use a quick explanation only when needed.</p>
      <div className="mt-4 flex gap-2">
        {Object.entries(helpCopy).map(([code, item]) => <button key={code} onClick={() => setLanguage(code)} className={`rounded-full px-4 py-2 text-sm font-black ${language === code ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{item.name}</button>)}
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
    if (stageIndex === stages.length - 1) setComplete(true);
    else setStageIndex((value) => value + 1);
  };

  const restart = () => {
    setStageIndex(0); setAnswer(null); setTapped(false); setComplete(false); setHelp(false);
  };

  const chooseSign = (choice) => {
    setAnswer(choice);
    if (choice === 'underground') window.setTimeout(advance, 700);
  };

  const tapCard = () => {
    if (tapped) return;
    setTapped(true);
    window.setTimeout(advance, 900);
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7 flex items-center justify-between gap-3">
          <div><div className="text-sm font-black tracking-[0.18em] text-blue-700">SMART PARROT</div><div className="mt-1 text-xl font-black">London Adventure</div></div>
          <div className="flex gap-2">
            <button onClick={() => setHelp(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm"><HelpCircle className="h-4 w-4" /> Help</button>
            <button onClick={restart} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm"><RotateCcw className="h-4 w-4" /> Restart</button>
          </div>
        </div>

        {!complete && <Progress stage={stage} />}

        <div className="mt-7">
          <AnimatePresence mode="wait">
            {complete ? (
              <motion.section key="complete" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} className="grid min-h-[660px] place-items-center rounded-[34px] bg-slate-950 p-8 text-center text-white shadow-2xl">
                <div><div className="mx-auto grid h-40 w-40 place-items-center rounded-full border-8 border-dashed border-sky-300 text-6xl">✓</div><p className="mt-8 text-xs font-black tracking-[.22em] text-sky-300">PASSPORT STAMP EARNED</p><h1 className="mt-3 text-4xl font-black sm:text-5xl">Welcome to London</h1><p className="mx-auto mt-4 max-w-lg text-slate-300">You found the Underground, passed the ticket gate and boarded the Piccadilly line.</p><div className="mx-auto mt-7 inline-flex rounded-full bg-white/10 px-6 py-3 text-lg font-black">+40 XP · Soho unlocked</div><div><button onClick={restart} className="mt-8 rounded-full bg-white px-7 py-3 font-black text-slate-950">Play again</button></div></div>
              </motion.section>
            ) : (
              <motion.section key={stage} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative min-h-[660px] overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-b from-sky-100 via-white to-slate-100 shadow-2xl">
                <div className="absolute left-5 top-5 z-20 rounded-full bg-white/85 px-4 py-2 text-xs font-black tracking-[.18em] text-slate-600">HEATHROW T5</div>
                <div className="absolute inset-x-0 bottom-0 h-[46%] bg-slate-200"><div className="h-2 bg-yellow-400" /></div>

                {stage === 'arrival' && <div className="absolute inset-0"><motion.div initial={{ x: '-40%' }} animate={{ x: '115%' }} transition={{ duration: 5.5, repeat: Infinity }} className="absolute top-24 text-5xl">✈️</motion.div><div className="absolute inset-x-5 bottom-5 rounded-[28px] bg-slate-950/94 p-6 text-white"><p className="text-xs font-black tracking-[.2em] text-sky-300">LONDON · MISSION 1</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">You have landed at Heathrow</h1><p className="mt-3 text-slate-300">Your first challenge: find the train into central London.</p><button onClick={advance} className="mt-6 inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 font-black text-slate-950">Enter the terminal <ArrowRight className="h-4 w-4" /></button></div></div>}

                {stage === 'sign' && <div className="absolute inset-0 px-5 pt-24"><div className="mx-auto max-w-xl text-center"><p className="text-xs font-black tracking-[.2em] text-blue-700">FIND YOUR WAY</p><h1 className="mt-3 text-3xl font-black">Which sign takes you to the Tube?</h1><p className="mt-2 text-slate-600">Tap the correct airport sign.</p></div><div className="mx-auto mt-10 grid max-w-xl gap-4 sm:grid-cols-2"><button onClick={() => chooseSign('parking')} className={`rounded-3xl border-2 bg-white p-6 text-left shadow-lg ${answer === 'parking' ? 'border-red-500' : 'border-white'}`}><div className="text-5xl">🅿️</div><div className="mt-4 text-xl font-black">Car park</div><div className="text-sm text-slate-500">Parking and rentals</div></button><button onClick={() => chooseSign('underground')} className={`rounded-3xl border-2 bg-white p-6 text-left shadow-lg ${answer === 'underground' ? 'border-emerald-500' : 'border-white'}`}><div className="relative grid h-14 w-14 place-items-center rounded-full border-[8px] border-red-600"><div className="absolute h-4 w-20 bg-blue-700" /></div><div className="mt-4 text-xl font-black">Underground</div><div className="text-sm text-slate-500">Trains to central London</div></button></div>{answer === 'parking' && <p className="mt-5 text-center font-bold text-red-600">Not this way — look for the Underground roundel.</p>}</div>}

                {stage === 'gate' && <div className="absolute inset-0 px-5 pt-20"><div className="text-center"><p className="text-xs font-black tracking-[.2em] text-blue-700">PAY AND ENTER</p><h1 className="mt-3 text-3xl font-black">Tap your contactless card</h1><p className="mt-2 text-slate-600">Touch the yellow reader to open the barrier.</p></div><div className="relative mx-auto mt-14 h-80 max-w-xl"><div className="absolute bottom-0 left-1/2 h-52 w-72 -translate-x-1/2 rounded-t-[42px] bg-slate-700 shadow-2xl"><button onClick={tapCard} className="absolute left-1/2 top-7 grid h-24 w-24 -translate-x-1/2 place-items-center rounded-3xl bg-yellow-400"><CreditCard className="h-11 w-11" /></button></div>{tapped && <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-emerald-500 px-5 py-3 font-black text-white">Beep! Gate open</div>}</div></div>}

                {stage === 'platform' && <div className="absolute inset-0 px-5 pt-20"><div className="text-center"><p className="text-xs font-black tracking-[.2em] text-blue-700">PICCADILLY LINE</p><h1 className="mt-3 text-3xl font-black">Board the train to central London</h1><p className="mt-2 text-slate-600">Choose the train marked Piccadilly line.</p></div><div className="relative mt-20 h-60 overflow-hidden"><motion.button initial={{ x: '105%' }} animate={{ x: '4%' }} transition={{ duration: 1.8 }} onClick={advance} className="absolute bottom-0 flex h-40 w-[92%] items-center rounded-[36px] border-4 border-blue-800 bg-white px-8 text-left shadow-2xl"><TrainFront className="h-16 w-16 text-blue-800" /><div className="ml-6"><div className="text-xs font-black tracking-[.18em] text-blue-700">PICCADILLY LINE</div><div className="mt-2 text-2xl font-black">Cockfosters via Central London</div><div className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-500"><MapPin className="h-4 w-4" /> Tap to board</div></div></motion.button></div></div>}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>{help && <HelpPanel stage={stage} complete={complete} close={() => setHelp(false)} />}</AnimatePresence>
    </main>
  );
}
