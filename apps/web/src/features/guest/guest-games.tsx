"use client";
import {useState} from 'react';
import {Icon} from '@/components/ui';
export function GuestGames(){
 const [mode,setMode]=useState('single'),[age,setAge]=useState('Adults');
 return <section className="guest-games" aria-label="Table arcade" tabIndex={-1}>
  <header className="guest-game-hero"><div className="guest-game-echo" aria-hidden="true"><span>CAN’T WIN?</span><span>CAN’T WIN?</span><span>CAN’T WIN?</span></div><img className="guest-game-tease" src="/images/guest/teasing-face.svg" width="76" height="76" alt="" aria-hidden="true"/><span className="guest-game-kicker"><Icon name="games"/>TABLE ARCADE</span><h2>Think you can win?</h2><p>Pick your challenge. Make the wait a little more interesting.</p></header>
  <div className="guest-game-modes" role="group" aria-label="Game mode"><button aria-pressed={mode==='single'} onClick={()=>setMode('single')}>Single player</button><button aria-pressed={mode==='multi'} onClick={()=>setMode('multi')}>Multiplayer</button></div>
  {mode==='single'&&<div className="guest-game-ages" role="group" aria-label="Age group">{['Kids','Adults','Seniors'].map(group=><button key={group} aria-pressed={age===group} onClick={()=>setAge(group)}>{group}</button>)}</div>}
  <div className="guest-game-heading"><h3>{mode==='single'?age+' challenges':'Table challenges'}</h3><span>3 surprise game slots</span></div>
  <div className="guest-game-slots">{[1,2,3].map(number=><article key={number}><span className="guest-game-number">0{number}</span><Icon name="games"/><h4>Game {number}</h4><span className="guest-game-soon">Coming soon</span></article>)}</div>
  <p className="guest-game-pending">The game lineup is being prepared. Games and shuffled picks will be available once the lineup is added.</p>
 </section>;
}
