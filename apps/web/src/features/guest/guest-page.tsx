"use client";
import {clientUuid} from "@/lib/browser-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { quote, quantityMilli, taxBreakdown, roundAdjustment } from "@dinerdost/core";
import { MenuPicture } from "@/components/menu-picture";
import { Badge, Empty, Icon, Logo, Modal } from "@/components/ui";
import {
  ApiError,
  date,
  label,
  money,
  request,
  idempotentPost,
  type Row,
} from "@/lib/client";
import { DishPicker } from "../workspace/dish-picker";
import {GuestCheckout,type GuestRewardChoice} from './guest-checkout';
import {GuestBillBreakdown} from './guest-bill-breakdown';
import { useActivityHeartbeat } from "@/lib/use-activity-heartbeat";
import { showOrderPlaced } from "@/lib/order-placed";

import {useUrlState} from '@/lib/use-url-state';
import {guestCourses,guestMenuCourse,guestKitchenProgress,guestCanRequestBill} from './guest-journey';
import {GuestGames} from './guest-games';
const journeySteps=guestCourses;
const guestDefaults={view:'home',step:String(journeySteps[0].id),category:'All',search:''};
export function GuestPage({ tableKey }: { tableKey: string }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<Row[]>([]);
  const [rewardChoice,setRewardChoice]=useState<GuestRewardChoice>({couponCode:'',loyaltyAmount:0});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [motionPaused,setMotionPaused]=useState(false);
  useEffect(()=>{try{setMotionPaused(localStorage.getItem('dd-guest-motion-paused')==='true')}catch{}},[]);
  const toggleMotion=()=>setMotionPaused(value=>{try{localStorage.setItem('dd-guest-motion-paused',String(!value))}catch{}return !value});
  const [serviceFeedback,setServiceFeedback]=useState<string|null>(null);
  const [urlState,updateUrl]=useUrlState(guestDefaults);
  const view=['home','menu','order','games'].includes(urlState.view)?urlState.view:'home';
  const menuStep=[...journeySteps.map(step=>step.id),'cart'].includes(urlState.step)?urlState.step:journeySteps[0].id;
  const {category,search}=urlState;
  const setView=(view:string)=>updateUrl({view});
  const setSearch=(search:string)=>updateUrl({search},true);
  const setCategory=(category:string)=>updateUrl({category},true);
  const [searchOpen,setSearchOpen]=useState(false);

  const [pick, setPick] = useState<Row | null>(null);
  const sending = useRef(false);
  const connection = useRef<Promise<unknown> | null>(null);
  const load = useCallback(async () => {
    const fresh = await request("/api/guest/" + tableKey);
    setData(fresh);
    setError("");
    return fresh;
  }, [tableKey]);
  const connect = useCallback(async () => {
    await request("/api/guest/" + tableKey, {
      method: "POST",
      body: JSON.stringify({ action: "connect", input: {} }),
    });
    return load();
  }, [tableKey, load]);
  useEffect(() => {
    connection.current ??= connect();
    void connection.current.catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden && !sending.current)
        void load().catch((e) => {
          if (e instanceof ApiError && e.status < 500) setError(e.message);
        });
    }, (view === "order" || view === "home") && data?.order ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [connect, load, view, !!data?.order]);
  useEffect(() => {
    if (!data?.activationRequired) return;
    setView("home");
    setPick(null);
    setCart([]);
  }, [data?.activationRequired]);
  useEffect(() => {
    const identity =
      data?.currentIdentity ??
      data?.identities?.find(
        (i: Row) => i.name === data.order?.customer_snapshot?.name,
      );
    if (identity && !phone) {
      setName(identity.name);
      setPhone(identity.phone);
    }
  }, [data?.order?.id, data?.identities, data?.currentIdentity, phone]);
  useEffect(()=>{
    if(view==='games'){document.querySelector<HTMLElement>('.guest-games')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});return}
    if(view!=='menu')return;
    const target=document.getElementById(menuStep==='cart'?'guest-cart':'guest-course-'+menuStep),trail=document.querySelector<HTMLElement>('.guest-journey');
    if(menuStep==='cart'){window.scrollTo({top:0,behavior:'instant'});return}
    if(target&&trail){const inset=trail.getBoundingClientRect().height+(parseFloat(getComputedStyle(trail).top)||0)+12;window.scrollTo({top:Math.max(0,window.scrollY+target.getBoundingClientRect().top-inset),behavior:'instant'})}
  },[view,menuStep]);
  const touchGuest = useCallback(
    () =>
      idempotentPost("/api/guest/" + tableKey, {
        action: "activity",
        input: {},
      }),
    [tableKey],
  );
  const refreshAfterActivityFailure = useCallback(() => {
    void load().catch(() => {});
  }, [load]);
  useActivityHeartbeat(
    !!data?.connected && !data.activationRequired,
    touchGuest,
    refreshAfterActivityFailure,
  );
  const send = async (action: string, input: unknown) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    try {
      if (!data?.connected)
        await request("/api/guest/" + tableKey, {
          method: "POST",
          body: JSON.stringify({ action: "connect", input: {} }),
        });
      const result = await idempotentPost("/api/guest/" + tableKey, {
        action,
        input,
      });
      // Preserve a successful submission even when the subsequent refresh fails.
      if (action === "order")
        setData((current) =>
          current ? { ...current, connected: true, order: result } : current,
        );
      await load().catch(() => {});
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      setNoticeError(true);
      await load().catch(() => {});
      throw e;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  if (error)
    return (
      <main className="guest-shell">
        <Logo />
        <Empty
          action={
            <button
              className="button"
              onClick={() => void connect().catch((e) => setError(e.message))}
            >
              Try again
            </button>
          }
        >
          {error}
        </Empty>
      </main>
    );
  if (!data)
    return (
      <div className="loading-page">
        <Logo />
        <div className="loader" />
      </div>
    );
  const menu: Row[] = data.menu;
  const courseMenu = menu.filter(m=>guestMenuCourse(m.category,m.menu_course)===menuStep);
  const categories = ["All", ...new Set<string>(courseMenu.map((m) => m.category))];
  const shown = courseMenu.filter(
    (m) =>
      (category === "All" || m.category === category) &&
      (m.name + " " + m.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = quote(
    cart.map((m) => ({
      unit_price: Number(m.price),
      quantity_milli: quantityMilli(m.quantity),
      tax_bps: Number(data.order?.tax_bps_override ?? m.tax_bps),
    })),
  );
  const count = cart.reduce((n, m) => n + Number(m.quantity), 0);
  const identityLocked =
    !!data.order &&
    !["SETTLED", "VOIDED", "REJECTED"].includes(data.order.status);
  const estimatedBase=total.payable+(identityLocked?0:(data.billDefaults?.charges??[]).reduce((sum:number,charge:Row)=>sum+Number(charge.amount),0)),estimatedMode=data.billDefaults?.roundingMode??'NONE',estimatedPayable=estimatedBase+roundAdjustment(estimatedBase,estimatedMode!=='NONE',estimatedMode);
  const add = (line: Row) =>
    setCart((prev) => [...prev, { ...line, cartId: clientUuid() }]);
  const addItem = (m: Row) => {
    if (m.variants.length || m.modifiers.length || m.unit !== "portion")
      setPick(m);
    else
      setCart((prev) => {
        const existing = prev.find(
          (l) => l.id === m.id && !l.variant && !l.modifiers?.length && !l.note,
        );
        return existing
          ? prev.map((l) =>
              l === existing ? { ...l, quantity: l.quantity + 1 } : l,
            )
          : [
              ...prev,
              { ...m, quantity: 1, modifiers: [], cartId: clientUuid() },
            ];
      });
  };
  const service = (kind: string, message: string) => {
    setServiceFeedback(null);
    void send("service", {kind}).then(()=>{setServiceFeedback(kind);setNotice(message)}).catch(()=>{});
  };
  const decrease = (id: string) =>
    setCart((previous) => {
      const index = previous.map((line) => line.id).lastIndexOf(id);
      if (index < 0) return previous;
      return previous.flatMap((line, i) =>
        i !== index
          ? [line]
          : line.quantity <= 1
            ? []
            : [
                {
                  ...line,
                  quantity: Math.round((line.quantity - 1) * 1000) / 1000,
                },
              ],
      );
    });
  const canRequestBill=guestCanRequestBill(data.order?.rounds);
  const trackingRound=data.order?.rounds[data.order.rounds.length-1];
  const trackingProgress=trackingRound?guestKitchenProgress(trackingRound):0;
  const trackingLabel=trackingProgress<0?label(trackingRound.status):trackingRound?.kot_status==='SERVED'?'Served':(['Waiting for acceptance','Accepted','Released to kitchen','Preparing','Ready to serve'][trackingProgress]);
  const activeStep=menuStep==='cart'?3:journeySteps.findIndex(step=>step.id===menuStep);
  const chooseStep=(step:string)=>updateUrl({view:'menu',step,category:'All',search:''});
  const nextCourse=()=>chooseStep(journeySteps[activeStep+1]?.id??'cart');
  return (
    <main className="guest-shell" data-view={view} data-motion-paused={motionPaused}>
      <header className="guest-header">
        <Logo />
        <span className="badge">Table {data.table}</span>
      </header>
      <div className="guest-motion-control"><button type="button" className="button secondary" aria-pressed={motionPaused} onClick={toggleMotion}>{motionPaused?'Resume animations':'Pause animations'}</button></div>
      {data.orderingEnabled===false&&<p className="notice" role="status">This outlet is not accepting new orders right now. Existing orders remain available below.</p>}
      {view!=="home"&&<button className="guest-back-menu" onClick={()=>setView("home")}><Icon name="back"/>Back to main menu</button>}
      {view === 'home' && <section className="guest-welcome">
        <span className="guest-restaurant-mark" role="img" aria-label={data.restaurant+' monogram'}>{Array.from(String(data.restaurant).trim())[0]}</span>
        <div className="guest-welcome-copy">
        <span className="eyebrow">
          {view === "home" ? "Welcome to" : data.outlet}
        </span>
        <div className="guest-restaurant-name"><h1>{data.restaurant}</h1><p className="guest-welcome-outlet">{data.outlet}</p></div><p className="guest-welcome-tip">Your table. Your next favourite bite.</p>
        </div>
      </section>}
      {view === "home" ? (
        <section className="guest-home" aria-label="Table service">
          <div className="guest-home-actions">
            <button className="guest-action-tile guest-menu-tile" aria-label="Menu" disabled={busy||data.activationRequired} onClick={()=>chooseStep(journeySteps[0].id)}><Icon name="dish"/><span className="guest-action-copy"><strong>Menu</strong><small>Find your next favourite</small></span><Icon name="chevron" className="guest-action-arrow"/></button>
            <button className="guest-action-tile" aria-label="Call waiter" data-requested={serviceFeedback==='HELP'} disabled={busy} onClick={()=>service('HELP','Your waiter has been called.')}><Icon name="customers"/><span className="guest-action-copy"><strong>Call waiter</strong><small>{serviceFeedback==='HELP'?'Request sent':'Need a hand?'}</small></span><Icon name="chevron" className="guest-action-arrow"/></button>
          </div>
          <div className="guest-quick-service">
            <button aria-label="Water" data-requested={serviceFeedback==='WATER'} disabled={busy||data.activationRequired} onClick={()=>service('WATER','Water requested.')}><Icon name="cup"/><span><strong>Water</strong><small>{serviceFeedback==='WATER'?'Request sent':'Stay refreshed'}</small></span></button>
            <button aria-label="Cleaning" data-requested={serviceFeedback==='CLEANUP'} disabled={busy||data.activationRequired} onClick={()=>service('CLEANUP','Cleaning requested.')}><Icon name="leaf"/><span><strong>Cleaning</strong><small>{serviceFeedback==='CLEANUP'?'Request sent':'Freshen the table'}</small></span></button>
          </div>
          <button className="guest-games-entry" disabled={busy} aria-label="Play games" onClick={()=>setView('games')}><span className="guest-games-entry-echo" aria-hidden="true">CAN’T WIN? CAN’T WIN?</span><Icon name="games"/><span><small>TABLE ARCADE</small><strong>Think you can win?</strong><span>Play games</span></span><img className="guest-game-tease" src={motionPaused?'/images/guest/teasing-face-still.svg':'/images/guest/teasing-face.svg'} width="64" height="64" alt="" aria-hidden="true"/><Icon name="chevron"/></button>
          {data.activationRequired && (
            <button
              className="button primary guest-request-activation"
              disabled={busy || data.activationRequested}
              onClick={() =>
                service(
                  "ACTIVATE_TABLE",
                  "Waiting for staff to activate your table.",
                )
              }
            >
              {data.activationRequested
                ? "Activation requested"
                : "Request table activation"}
            </button>
          )}
          {data.order&&<button className="guest-home-order guest-track-order" aria-label="Track my order" disabled={busy||data.activationRequired} onClick={()=>setView('order')}><span className="guest-track-icon"><Icon name="orders"/></span><span className="guest-track-copy"><strong>Track my order</strong><small>#{data.order.number} · {trackingLabel}</small></span><span className="guest-track-live">Live</span><Icon name="chevron"/><span className="guest-track-meter" aria-hidden="true"><span style={{width:Math.max(0,trackingProgress)*25+'%'}}/></span></button>}
          {canRequestBill&&<button className="guest-request-bill" aria-label="Request bill" data-requested={serviceFeedback==='BILL'} disabled={busy||data.activationRequired} onClick={()=>service('BILL','Your bill has been requested.')}><Icon name="payments"/><span><strong>Request bill</strong><small>{serviceFeedback==='BILL'?'Request sent':'All rounds served'}</small></span><Icon name="chevron"/></button>}
        </section>
      ) : null}
      {view==='menu'&&menuStep!=='cart'&&<nav className="guest-journey" aria-label="Dining journey"><ol>{journeySteps.map((step,index)=><li key={step.id} data-complete={index<activeStep}><button type="button" aria-current={index===activeStep?'step':undefined} onClick={()=>chooseStep(step.id)}><Icon name={step.icon}/><span>Step {index+1}</span><strong>{step.label}</strong></button></li>)}</ol></nav>}
      {view==='games'&&<GuestGames motionPaused={motionPaused}/>}
      {view==='menu'&&menuStep==='cart'&&!cart.length&&<Empty action={<button className="button" onClick={()=>chooseStep(journeySteps[0].id)}>Browse menu</button>}>Your cart is empty.</Empty>}
      {notice && (
        <div
          className={noticeError ? "error" : "success-note"}
          role={noticeError ? "alert" : "status"}
        >
          {notice}
        </div>
      )}
      {view === "order" && !data.activationRequired && (
        <>
          {data.order ? (
            <section className="panel guest-status">
              <div className="panel-heading"><div><h2>Order #{data.order.number}</h2></div><Badge value={data.order.status}/></div>
              <div className="guest-tracking-meta"><span><Icon name="floor"/>Table {data.table}</span><time dateTime={data.order.created_at}>{date(data.order.created_at)}</time>{data.order.customer_snapshot?.name&&<span><Icon name="customers"/>{data.order.customer_snapshot.name}</span>}</div>
              {data.order.rounds.map((round:Row)=><article className="guest-tracked-round" key={round.id}>
                <header><strong>Round {round.round_number}</strong><Badge value={round.status}/></header><GuestPreparation round={round}/>
                <button type="button" className="guest-tracking-games" aria-label="Take a games break" onClick={()=>setView('games')}>
                  <span className="guest-tracking-games-copy"><span className="guest-tracking-games-kicker"><Icon name="games"/>TABLE ARCADE</span><strong>Tired of waiting??</strong><span className="guest-tracking-games-challenge">Make sure you ain’t tired of <em>losing.</em></span><span className="guest-tracking-games-action">Challenge accepted?<Icon name="arrow"/></span></span>
                  <img src={motionPaused?'/images/guest/teasing-face-still.svg':'/images/guest/teasing-face.svg'} width="112" height="112" alt="" aria-hidden="true"/>
                </button>
                <div className="guest-tracked-items">{round.items.map((item:Row,index:number)=><div key={index}><span><strong>{Number(item.quantity_milli)/1000} × {item.name}</strong>{item.variant&&<small>{item.variant}</small>}{item.note&&<small>{item.note}</small>}</span><strong>{money(Math.round(Number(item.unit_price)*Number(item.quantity_milli)/1000))}</strong></div>)}</div>
                <GuestBillBreakdown bill={{subtotal:round.subtotal,discount:round.discount,discountLabel:round.coupon_code?'Coupon · '+round.coupon_code:round.reward_name??'Discount',tax:round.tax,taxes:taxBreakdown(Number(round.tax),data.order.tax_components),taxRates:[...new Set(round.items.map((item:Row)=>Number(item.tax_bps)))],charges:round.charges,roundOff:round.round_off,payable:round.payable}} paid={Number(round.paid)}/>
              </article>)}
              <small className="guest-counter-note">Pay your server or at the counter.</small>
            </section>
          ) : (
            <Empty>Choose something from the menu to start your order.</Empty>
          )}
          <div className="guest-service">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void send("service", { kind: "WATER" })
                  .then(() => setNotice("Water requested."))
                  .catch(() => {})
              }
            >
              Request water
            </button>
            {canRequestBill&&<button className="button guest-request-bill" disabled={busy} onClick={()=>service('BILL','Your bill has been requested.')}>Request bill</button>}
          </div>
        </>
      )}
      {view === "menu" && menuStep !== "cart" && !data.activationRequired && (
        <>
          <div className="guest-course-heading" id={"guest-course-"+menuStep}>
            <div className="guest-course-copy"><h1>{guestCourses.find(course=>course.id===menuStep)?.label}</h1><p>Choose what you like, or skip to the next course.</p></div>
            <div className="guest-course-actions" role="group" aria-label="Course actions">
              <button type="button" className="icon-button guest-course-search" aria-label="Search dishes" aria-haspopup="dialog" onClick={e=>{e.currentTarget.focus();setSearchOpen(true)}}><Icon name="search"/></button>
              <button className="guest-skip-course" aria-label={'Skip '+guestCourses.find(course=>course.id===menuStep)?.label} onClick={nextCourse}><Icon name="skip"/><span>Skip</span></button>
            </div>
          </div>
          {searchOpen&&<Modal title="Find a dish" className="guest-search-modal" onClose={()=>setSearchOpen(false)}><form className="guest-dish-search-form" onSubmit={e=>{e.preventDefault();setSearchOpen(false)}}><label htmlFor="guest-dish-search">Dish name</label><div className="guest-search"><Icon name="search"/><input id="guest-dish-search" type="search" placeholder="What are you craving?" aria-label="Search menu" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="guest-search-actions"><button type="button" className="button secondary" onClick={()=>setSearch('')}>Clear search</button><button type="submit" className="button primary">Show dishes<Icon name="chevron"/></button></div></form></Modal>}
          {categories.length>2&&<div className="guest-categories" aria-label="Menu categories">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>}
          <div className="guest-menu">
            {shown.map((m) => (
              <article
                key={m.id}
                className={
                  cart.some((line) => line.id === m.id) ? "is-added" : ""
                }
              >
                <MenuPicture item={m} />
                <div className="guest-dish-copy">
                  <small>{m.category}</small>
                  <h3>{m.name}</h3><div className="guest-dish-tags">{m.guest_best_choice&&<span className="guest-choice-tag">Best choice</span>}{Number(m.compare_at_price)>Number(m.price)&&<span className="guest-offer-tag">Save {money(Number(m.compare_at_price)-Number(m.price))}{m.variants.length||m.modifiers.length?' on base price':''}</span>}{m.ready_to_serve&&<span className="ready-food-tag">Ready to serve</span>}</div>
                  {m.description && !m.ready_to_serve && <p>{m.description}</p>}
                </div>
                <div className="guest-add">
                  <strong className="guest-card-price">
                    {Number(m.compare_at_price)>Number(m.price)&&<del aria-label="Regular base price">{money(m.compare_at_price)}</del>}
                    {money(m.price)}
                    {m.unit !== "portion" && " / " + m.unit}
                  </strong>
                  <div
                    className="guest-card-stepper"
                    role="group"
                    aria-label={m.name + " quantity controls"}
                  >
                    {cart.some((line) => line.id === m.id) && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={"Decrease " + m.name}
                          onClick={() => decrease(m.id)}
                        >
                          <Icon name="minus" />
                        </button>
                        <span
                          aria-live="polite"
                          aria-label={m.name + " quantity in cart"}
                        >
                          {cart
                            .filter((line) => line.id === m.id)
                            .reduce((n, line) => n + line.quantity, 0)}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={"Add " + m.name}
                      onClick={() => addItem(m)}
                    >
                      <Icon name="plus" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!shown.length && (
            <Empty>
              {courseMenu.length ? "No dishes match your search in this course." : "No dishes in this course today. Continue to the next step."}
            </Empty>
          )}
          {activeStep>0&&<div className="guest-course-navigation"><button className="button guest-previous-course" onClick={()=>chooseStep(journeySteps[activeStep-1].id)}><Icon name="back"/>Previous</button></div>}
        </>
      )}
      {cart.length > 0 && !data.activationRequired && view==='menu' && menuStep==='cart' && (
        <GuestCheckout data={data} tableKey={tableKey} cart={cart} busy={busy} name={identityLocked?data.order.customer_snapshot.name:name} phone={phone} identityLocked={identityLocked} choice={rewardChoice} onChoice={setRewardChoice} onIdentity={(nextName,nextPhone)=>{setName(nextName);setPhone(nextPhone)}} onQuantity={(cartId,value)=>setCart(previous=>previous.map(item=>item.cartId===cartId?{...item,quantity:value}:item))} onRemove={cartId=>setCart(previous=>previous.filter(item=>item.cartId!==cartId))} onSubmit={async rewards=>{
          const result=await send('order',{items:cart.map(item=>({itemId:item.id,quantity:String(item.quantity),...(item.variant?{variant:item.variant}:{}),modifiers:item.modifiers??[],note:item.note??''})),name:identityLocked?data.order.customer_snapshot.name:name,phone,...(identityLocked?{version:data.order.version}:{}),...rewards});
          if(result){setCart([]);setRewardChoice({couponCode:'',loyaltyAmount:0});setView('home');setNotice('Order sent. Your server will confirm it shortly.');void showOrderPlaced(result,{table:data.table,type:'DINE_IN',confirmText:'Track my order',cancelText:'Back to main menu'}).then(answer=>{if(answer.isConfirmed)setView('order')})}
        }}/>
      )}
      {cart.length > 0 && view === "menu" && menuStep!=='cart' && (
        <div className="guest-cart-bar" role="region" aria-label="Floating cart"><button className="guest-cart-open" aria-label={'View cart, '+count+' items'} onClick={()=>chooseStep('cart')}><span className="guest-cart-symbol"><Icon name="cart"/><b>{count}</b></span><span><strong>{money(estimatedPayable)}</strong><small>{count} {count===1?'item':'items'} · before offers</small></span></button><button className="guest-cart-checkout" aria-label="Order from cart" disabled={busy||data.orderingEnabled===false||data.activationRequired} onClick={()=>chooseStep('cart')}><span>Order</span><Icon name="arrow"/></button></div>
      )}
      {(view==='home'||view==='games')&&<footer className="guest-footer">
        <Logo />
      </footer>}
      {pick && (
        <Modal title={pick.name} onClose={() => setPick(null)}>
          <DishPicker
            item={pick}
            onAdd={(line) =>
              add({ ...line, modifiers_options: pick.modifiers })
            }
            onClose={() => setPick(null)}
          />
        </Modal>
      )}
    </main>
  );
}

function GuestPreparation({round}:{round:Row}){
 const progress=guestKitchenProgress({status:round.status,kot_status:round.kot_status});
 const served=round.kot_status==='SERVED'||['SERVED','SETTLED'].includes(round.status);
 const [selected,setSelected]=useState<number|null>(null);
 useEffect(()=>setSelected(null),[progress,served]);
 const stages=[
  {label:'Accepted',icon:'check',detail:'Your server confirms the items in this round before sending them to the kitchen.'},
  {label:'In the kitchen',icon:'orders',detail:'This round has been released to the kitchen. The team will begin preparing it.'},
  {label:'Preparing',icon:'kitchen',detail:'The kitchen is preparing this round. Your status will update here when it is ready.'},
  {label:'Ready to serve',icon:'dish',detail:'This round is ready for your server to bring to the table.'},
 ];
 if(progress<0)return <p className="guest-progress-closed" role="status">{label(round.status)}{round.rejection_reason?' · '+round.rejection_reason:''}</p>;
 const current=Math.max(0,progress-1),shown=selected??current,detailsId='round-progress-'+round.id;
 const title=served?'Served at your table':progress?stages[current].label:'Order received';
 const summary=served?'We hope you enjoy your meal.':[
  'Your order is with the team. Follow its progress here.',
  'Your server has confirmed this round.',
  'Your round is in the kitchen queue.',
  'The kitchen is working on this round.',
  'Your server will bring this round to your table.',
 ][progress];
 const detail=served?'Enjoy your meal! You can add another round or request your bill when all rounds are served.':progress?stages[current].detail:'Waiting for your server to accept this round.';
 const stepState=(index:number)=>served||progress>index+1?'Completed':progress===index+1?'Current step':index===0?'Waiting for confirmation':'Upcoming';
 return <section className="guest-preparation" aria-label={'Round '+round.round_number+' progress'}>
  <div className="guest-progress-heading" role="status" aria-live="polite">
   <span className="guest-progress-emblem"><Icon name={served?'check':progress?stages[current].icon:'clock'}/></span>
   <div><h3>{title}</h3><p>{summary}</p></div>
  </div>
  <div className="guest-progress-body">
   <p className="guest-progress-hint">Tap a step to explore your order’s journey.</p>
   <ol className="guest-progress-steps">{stages.map((stage,index)=><li key={stage.label} data-complete={served||progress>index} data-current={!served&&progress===index+1}>
    <button type="button" aria-pressed={shown===index} aria-current={!served&&progress===index+1?'step':undefined} aria-controls={detailsId} aria-label={stage.label+' · '+stepState(index)} onClick={()=>setSelected(index)}>
     <span className="guest-progress-step-icon"><Icon name={stage.icon}/></span><span>{stage.label}</span>
    </button>
   </li>)}</ol>
   <div className="guest-progress-journey">
   <div className="guest-progress-track" role="progressbar" aria-label="Kitchen progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={progress} aria-valuetext={served?'Served at your table':progress?stages[current].label:'Waiting for acceptance'}><span style={{width:Math.max(0,progress-1)/3*100+'%'}}/></div>
   <div className="guest-progress-checkpoints" aria-hidden="true">{stages.map((stage,index)=><span key={stage.label} data-reached={served||progress>index} data-current={!served&&progress===index+1}>{served||progress>index?<Icon name="check"/>:<span/>}</span>)}</div>
   </div>
   <div className="guest-progress-detail" id={detailsId}>
    <div><strong>{stages[shown].label}</strong><span>{stepState(shown)}</span></div>
    <p>{shown===current?detail:stages[shown].detail}</p>
    {shown!==current&&<button type="button" onClick={()=>setSelected(null)}>Back to current update<Icon name="arrow"/></button>}
   </div>
  </div>
 </section>;
}
