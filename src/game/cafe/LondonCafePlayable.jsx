import '@/game/r3fSafeDataProps';
import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import { CreditCard, RotateCcw, ShoppingBag, Utensils } from 'lucide-react';
import { loadRenderProfilePreference, readRenderCapabilities, resolveRenderProfile } from '@/game/heathrow/renderProfiles';
import { writeCafeRecoveryCache } from './recoveryCache';

const MENU = Object.freeze([
  { id: 'latte', name: 'Latte', price: 3.8, type: 'drink' },
  { id: 'tea', name: 'English Breakfast Tea', price: 2.7, type: 'drink' },
  { id: 'croissant', name: 'Croissant', price: 2.5, type: 'food' },
  { id: 'sandwich', name: 'Ham & Cheese Sandwich', price: 5.9, type: 'food' },
]);

const STEPS = ['menu', 'order', 'clarify', 'service', 'pay', 'collect', 'complete'];
const STEP_COPY = {
  menu: 'Read the menu board.',
  order: 'Choose one drink and one food item.',
  clarify: 'Answer the barista’s clarification.',
  service: 'Choose eat-in or takeaway.',
  pay: 'Pay for your order.',
  collect: 'Collect the correct order.',
  complete: 'Café mission complete!',
};

function CafeScene({ selected, readyOrders, onMenu }) {
  return (
    <>
      <color attach="background" args={['#9bc5db']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[5, 9, 4]} intensity={2.2} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 22]} />
        <meshStandardMaterial color="#d8c7ad" roughness={0.88} />
      </mesh>
      <mesh position={[0, 4, -5]} receiveShadow>
        <boxGeometry args={[19, 8, .35]} />
        <meshStandardMaterial color="#f4eadb" />
      </mesh>
      <RoundedBox args={[15, 1.35, 2.2]} radius={0.2} position={[0, .75, -2.7]} castShadow>
        <meshStandardMaterial color="#7a422c" roughness={0.65} />
      </RoundedBox>
      <RoundedBox args={[6.2, 3.7, .28]} radius={0.12} position={[-4.2, 4.25, -4.75]} onClick={onMenu}>
        <meshStandardMaterial color="#173b32" roughness={0.8} />
      </RoundedBox>
      <Text position={[-4.2, 5.55, -4.55]} fontSize={.42} color="#fff6d7" anchorX="center">LONDON CAFÉ</Text>
      <Text position={[-4.2, 4.8, -4.55]} fontSize={.26} color="white" anchorX="center">Latte £3.80 · Tea £2.70</Text>
      <Text position={[-4.2, 4.25, -4.55]} fontSize={.26} color="white" anchorX="center">Croissant £2.50</Text>
      <Text position={[-4.2, 3.7, -4.55]} fontSize={.26} color="white" anchorX="center">Ham & Cheese £5.90</Text>
      <group position={[3.5, 1.35, -3.2]}>
        <mesh castShadow><capsuleGeometry args={[.55, 1.5, 8, 16]} /><meshStandardMaterial color="#1e293b" /></mesh>
        <mesh position={[0, 1.5, 0]} castShadow><sphereGeometry args={[.52, 24, 24]} /><meshStandardMaterial color="#d6a47c" /></mesh>
        <Text position={[0, 2.45, .1]} fontSize={.28} color="#0f172a" anchorX="center">BARISTA</Text>
      </group>
      {readyOrders.map((order, index) => (
        <group key={order.id} position={[-2.3 + index * 2.4, 1.6, -2]}>
          <RoundedBox args={[1.7, .18, 1.05]} radius={.08}><meshStandardMaterial color="#d4a574" /></RoundedBox>
          <mesh position={[-.35, .35, 0]}><cylinderGeometry args={[.22, .18, .55, 18]} /><meshStandardMaterial color={order.correct ? '#f8fafc' : '#cbd5e1'} /></mesh>
          <mesh position={[.35, .28, 0]}><boxGeometry args={[.55, .22, .4]} /><meshStandardMaterial color={order.correct ? '#f4c27a' : '#a78bfa'} /></mesh>
        </group>
      ))}
      <Text position={[0, 7.2, -4.6]} fontSize={.48} color="#7c2d12" anchorX="center">Smart Parrot · Level 4</Text>
      {selected.length > 0 && <Text position={[0, .25, 1.6]} fontSize={.34} color="#0f172a" anchorX="center">Order: {selected.map((x) => x.name).join(' + ')}</Text>}
    </>
  );
}

function ChoicePanel({ title, subtitle, options, onChoose }) {
  return (
    <section className="w-full max-w-md rounded-[26px] border border-white/20 bg-slate-950/90 p-5 text-white shadow-2xl backdrop-blur-xl">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-300">{subtitle}</p>
      <div className="mt-4 grid gap-2">
        {options.map((option) => (
          <button key={option.label} type="button" onClick={() => onChoose(option)} className="min-h-12 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-left text-sm font-black transition hover:bg-white/[0.14] active:scale-[0.99]">
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function LondonCafePlayable() {
  const [step, setStep] = useState('menu');
  const [selected, setSelected] = useState([]);
  const [service, setService] = useState('');
  const [payment, setPayment] = useState('');
  const [message, setMessage] = useState('Tap the menu board to begin.');
  const profile = useMemo(() => resolveRenderProfile(loadRenderProfilePreference(), readRenderCapabilities()), []);
  const total = selected.reduce((sum, item) => sum + item.price, 0);
  const progress = Math.max(0, STEPS.indexOf(step)) / (STEPS.length - 1);
  const correctOrder = selected.map((item) => item.name).join(' + ');
  const readyOrders = step === 'collect' ? [
    { id: 'wrong', label: 'Tea + muffin', correct: false },
    { id: 'correct', label: correctOrder, correct: true },
    { id: 'wrong2', label: 'Latte + sandwich', correct: false },
  ] : [];

  useEffect(() => {
    try {
      writeCafeRecoveryCache({ step, selected, service, payment });
    } catch { /* recovery cache is best-effort */ }
  }, [step, selected, service, payment]);

  const reset = () => {
    setStep('menu'); setSelected([]); setService(''); setPayment(''); setMessage('Tap the menu board to begin.');
  };

  const chooseMenuItem = (item) => {
    const withoutType = selected.filter((x) => x.type !== item.type);
    const next = [...withoutType, item];
    setSelected(next);
    if (next.some((x) => x.type === 'drink') && next.some((x) => x.type === 'food')) {
      setStep('clarify');
      setMessage('Barista: “Would you like milk or sugar with that?”');
    }
  };

  return (
    <main tabIndex={-1} data-render-profile={profile.id} data-render-dpr={profile.initialDpr.toFixed(2)} className="relative h-[100svh] w-full overflow-hidden bg-slate-950 outline-none">
      <Canvas dpr={profile.initialDpr} shadows={profile.shadows} gl={{ antialias: profile.antialias, powerPreference: 'high-performance', precision: profile.precision }} camera={{ position: [0, 5.8, 10.5], fov: 48 }}>
        <CafeScene selected={selected} readyOrders={readyOrders} onMenu={() => { setStep('order'); setMessage('Choose one drink and one food item.'); }} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-5">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-3 rounded-[24px] border border-white/15 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur-xl">
          <div><div className="text-[10px] font-black tracking-[.18em] text-amber-300">LEVEL 4 · LONDON CAFÉ</div><div className="mt-1 text-sm font-black sm:text-base">{STEP_COPY[step]}</div><div className="mt-1 text-xs font-semibold text-slate-300">{message}</div></div>
          <button type="button" onClick={reset} className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10"><RotateCcw className="h-4 w-4" /></button>
        </div>
        <div className="mx-auto mt-2 h-2 max-w-5xl overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-300 transition-all" style={{ width: `${progress * 100}%` }} /></div>
      </div>

      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
        {step === 'order' && <ChoicePanel title="What can I get for you?" subtitle="Choose one drink and one food item." options={MENU.map((item) => ({ ...item, label: `${item.name} — £${item.price.toFixed(2)}` }))} onChoose={chooseMenuItem} />}
        {step === 'clarify' && <ChoicePanel title="Milk or sugar?" subtitle="Respond to the clarification." options={[{ label: 'A little milk, please.' }, { label: 'No sugar, thank you.' }, { label: 'Both, please.' }]} onChoose={(option) => { setMessage(`You: “${option.label}”`); setStep('service'); }} />}
        {step === 'service' && <ChoicePanel title="Eat in or takeaway?" subtitle="Choose how you want the order served." options={[{ label: 'Eat in', value: 'eat-in', icon: Utensils }, { label: 'Takeaway', value: 'takeaway', icon: ShoppingBag }]} onChoose={(option) => { setService(option.value); setStep('pay'); setMessage(`Barista: “That’ll be £${total.toFixed(2)}, please.”`); }} />}
        {step === 'pay' && <ChoicePanel title={`Pay £${total.toFixed(2)}`} subtitle="Choose a valid payment method." options={[{ label: 'Tap contactless card', value: 'card' }, { label: `Pay £${total.toFixed(2)} exact cash`, value: 'cash' }, { label: 'Pay £2.00', value: 'wrong' }]} onChoose={(option) => { if (option.value === 'wrong') { setMessage('That is not enough. Check the total and try again.'); return; } setPayment(option.value); setStep('collect'); setMessage('Barista: “Order for Alex!” Choose the correct tray.'); }} />}
        {step === 'collect' && <ChoicePanel title="Collect your order" subtitle="Which tray is yours?" options={readyOrders.map((order) => ({ label: order.label, correct: order.correct }))} onChoose={(order) => { if (!order.correct) { setMessage('Sorry — that one is not yours. Listen and check the items.'); return; } setStep('complete'); setMessage('Mission complete — you ordered, paid, and collected correctly!'); }} />}
        {step === 'complete' && <section className="w-full max-w-md rounded-[28px] border border-amber-200/40 bg-slate-950/92 p-6 text-center text-white shadow-2xl backdrop-blur-xl"><div className="text-4xl">☕</div><h2 className="mt-3 text-2xl font-black">Coffee Break complete!</h2><p className="mt-2 text-sm font-semibold text-slate-300">+250 XP · 40 Smart Coins · London Café badge</p><div className="mt-4 flex items-center justify-center gap-2 text-xs font-black text-amber-300"><CreditCard className="h-4 w-4" /> {payment === 'card' ? 'Paid by card' : 'Paid with exact cash'} · {service}</div><button type="button" onClick={reset} className="mt-5 min-h-12 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950">Play again</button></section>}
      </div>
    </main>
  );
}
