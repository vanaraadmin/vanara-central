import { useMemo, useState } from "react";
import { useLanguage } from "../providers/language.context";
import {
  AlertIcon, ArrowRightIcon, BackIcon, CalendarIcon, CameraIcon, CheckIcon,
  CheckInIcon, CheckOutIcon, ChevronDownIcon, HousekeepingIcon, MaintenanceIcon,
  PlusIcon, RoomIcon, SparkleIcon, UserIcon
} from "../components/OperationsIcons";
import "../styles/OpsMvpPage.css";

type View = "home" | "checkin" | "checkout" | "housekeeping" | "maintenance";
type CleanStatus = "Dirty" | "In progress" | "Inspection" | "Ready";
type Lang = "en" | "th";

type Copy = {
  brand: string; morning: string; prompt: string; today: string; checkin: string; checkout: string;
  housekeeping: string; maintenance: string; arrivals: string; departures: string; next: string;
  dirty: string; inProgress: string; inspection: string; ready: string; reportProblem: string;
  fastSupport: string; blocked: string; aircon: string; open: string; selectDate: string;
  selectedDate: string; guests: string; passport: string; depositReceived: string; depositReturned: string;
  confirmIn: string; confirmOut: string; workQueue: string; roomsPrepare: string; rooms: string;
  assignedTo: string; takeRoom: string; sendInspection: string; markReady: string; roomArea: string;
  selectPlace: string; problemType: string; urgency: string; normal: string; urgent: string;
  shortNote: string; notePlaceholder: string; addPhoto: string; photoHelper: string; sendMaintenance: string;
  problemSent: string; sentHelper: string; reportAnother: string; todayCalm: string; overview: string;
  tasksWaiting: string; allGood: string;
};

const copy: Record<Lang, Copy> = {
  en: {
    brand:"Vanara Operations", morning:"Good morning", prompt:"What needs attention?", today:"Today",
    checkin:"Check-in", checkout:"Check-out", housekeeping:"Housekeeping", maintenance:"Maintenance",
    arrivals:"arrivals", departures:"departures", next:"Next", dirty:"Dirty", inProgress:"In progress",
    inspection:"Inspection", ready:"Ready", reportProblem:"Report a problem", fastSupport:"Fast room support",
    blocked:"1 room blocked", aircon:"Bungalow 7 Â· Air-conditioning", open:"Open", selectDate:"Choose date",
    selectedDate:"Selected date", guests:"guests", passport:"Passport verified", depositReceived:"Deposit received",
    depositReturned:"Deposit returned", confirmIn:"Confirm check-in", confirmOut:"Confirm check-out",
    workQueue:"Work queue", roomsPrepare:"Rooms to prepare", rooms:"rooms", assignedTo:"Assigned to",
    takeRoom:"Take room", sendInspection:"Send to inspection", markReady:"Mark ready", roomArea:"Room or area",
    selectPlace:"Select a place", problemType:"Problem type", urgency:"Urgency", normal:"Normal", urgent:"Urgent",
    shortNote:"Short note", notePlaceholder:"Example: Air-con is not cooling", addPhoto:"Add photo",
    photoHelper:"Only when it helps explain the problem", sendMaintenance:"Send to maintenance",
    problemSent:"Problem sent", sentHelper:"The maintenance person will receive the report.",
    reportAnother:"Report another problem", todayCalm:"Today looks manageable", overview:"Your shift at a glance",
    tasksWaiting:"tasks waiting", allGood:"Everything is under control"
  },
  th: {
    brand:"à¸‡à¸²à¸™à¸›à¸£à¸°à¸ˆà¸³à¸§à¸±à¸™à¸§à¸²à¸™à¸²à¸£à¸²", morning:"à¸ªà¸§à¸±à¸ªà¸”à¸µà¸•à¸­à¸™à¹€à¸Šà¹‰à¸²", prompt:"à¸•à¸­à¸™à¸™à¸µà¹‰à¸•à¹‰à¸­à¸‡à¸—à¸³à¸­à¸°à¹„à¸£?", today:"à¸§à¸±à¸™à¸™à¸µà¹‰",
    checkin:"à¹€à¸Šà¹‡à¸à¸­à¸´à¸™", checkout:"à¹€à¸Šà¹‡à¸à¹€à¸­à¸²à¸•à¹Œ", housekeeping:"à¸‡à¸²à¸™à¸—à¸³à¸„à¸§à¸²à¸¡à¸ªà¸°à¸­à¸²à¸”", maintenance:"à¹à¸ˆà¹‰à¸‡à¸‹à¹ˆà¸­à¸¡",
    arrivals:"à¸«à¹‰à¸­à¸‡à¹€à¸Šà¹‡à¸à¸­à¸´à¸™", departures:"à¸«à¹‰à¸­à¸‡à¹€à¸Šà¹‡à¸à¹€à¸­à¸²à¸•à¹Œ", next:"à¸–à¸±à¸”à¹„à¸›", dirty:"à¸«à¹‰à¸­à¸‡à¸ªà¸à¸›à¸£à¸", inProgress:"à¸à¸³à¸¥à¸±à¸‡à¸—à¸³",
    inspection:"à¸£à¸­à¸•à¸£à¸§à¸ˆ", ready:"à¸žà¸£à¹‰à¸­à¸¡", reportProblem:"à¹à¸ˆà¹‰à¸‡à¸›à¸±à¸à¸«à¸²", fastSupport:"à¸Šà¹ˆà¸§à¸¢à¹€à¸«à¸¥à¸·à¸­à¸«à¹‰à¸­à¸‡à¸žà¸±à¸à¸­à¸¢à¹ˆà¸²à¸‡à¸£à¸§à¸”à¹€à¸£à¹‡à¸§",
    blocked:"à¸¡à¸µà¸«à¹‰à¸­à¸‡à¸›à¸´à¸”à¹ƒà¸Šà¹‰à¸‡à¸²à¸™ 1 à¸«à¹‰à¸­à¸‡", aircon:"à¸šà¸±à¸‡à¸à¸°à¹‚à¸¥ 7 Â· à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸›à¸£à¸±à¸šà¸­à¸²à¸à¸²à¸¨", open:"à¹€à¸›à¸´à¸”", selectDate:"à¹€à¸¥à¸·à¸­à¸à¸§à¸±à¸™à¸—à¸µà¹ˆ",
    selectedDate:"à¸§à¸±à¸™à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸", guests:"à¸„à¸™", passport:"à¸•à¸£à¸§à¸ˆà¸žà¸²à¸ªà¸›à¸­à¸£à¹Œà¸•à¹à¸¥à¹‰à¸§", depositReceived:"à¸£à¸±à¸šà¹€à¸‡à¸´à¸™à¸¡à¸±à¸”à¸ˆà¸³à¹à¸¥à¹‰à¸§",
    depositReturned:"à¸„à¸·à¸™à¹€à¸‡à¸´à¸™à¸¡à¸±à¸”à¸ˆà¸³à¹à¸¥à¹‰à¸§", confirmIn:"à¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸Šà¹‡à¸à¸­à¸´à¸™", confirmOut:"à¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸Šà¹‡à¸à¹€à¸­à¸²à¸•à¹Œ",
    workQueue:"à¸„à¸´à¸§à¸‡à¸²à¸™", roomsPrepare:"à¸«à¹‰à¸­à¸‡à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¹€à¸•à¸£à¸µà¸¢à¸¡", rooms:"à¸«à¹‰à¸­à¸‡", assignedTo:"à¸œà¸¹à¹‰à¸£à¸±à¸šà¸‡à¸²à¸™",
    takeRoom:"à¸£à¸±à¸šà¸‡à¸²à¸™", sendInspection:"à¸ªà¹ˆà¸‡à¸•à¸£à¸§à¸ˆ", markReady:"à¸žà¸£à¹‰à¸­à¸¡à¹ƒà¸Šà¹‰à¸‡à¸²à¸™", roomArea:"à¸«à¹‰à¸­à¸‡à¸«à¸£à¸·à¸­à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆ",
    selectPlace:"à¹€à¸¥à¸·à¸­à¸à¸ªà¸–à¸²à¸™à¸—à¸µà¹ˆ", problemType:"à¸›à¸£à¸°à¹€à¸ à¸—à¸›à¸±à¸à¸«à¸²", urgency:"à¸„à¸§à¸²à¸¡à¹€à¸£à¹ˆà¸‡à¸”à¹ˆà¸§à¸™", normal:"à¸›à¸à¸•à¸´", urgent:"à¸”à¹ˆà¸§à¸™",
    shortNote:"à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸ªà¸±à¹‰à¸™ à¹†", notePlaceholder:"à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡: à¹à¸­à¸£à¹Œà¹„à¸¡à¹ˆà¹€à¸¢à¹‡à¸™", addPhoto:"à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸¹à¸›à¸ à¸²à¸ž",
    photoHelper:"à¹€à¸žà¸´à¹ˆà¸¡à¹€à¸‰à¸žà¸²à¸°à¹€à¸¡à¸·à¹ˆà¸­à¸Šà¹ˆà¸§à¸¢à¸­à¸˜à¸´à¸šà¸²à¸¢à¸›à¸±à¸à¸«à¸²", sendMaintenance:"à¸ªà¹ˆà¸‡à¹ƒà¸«à¹‰à¸Šà¹ˆà¸²à¸‡",
    problemSent:"à¸ªà¹ˆà¸‡à¸›à¸±à¸à¸«à¸²à¹à¸¥à¹‰à¸§", sentHelper:"à¸Šà¹ˆà¸²à¸‡à¸ˆà¸°à¹„à¸”à¹‰à¸£à¸±à¸šà¸£à¸²à¸¢à¸‡à¸²à¸™à¸™à¸µà¹‰", reportAnother:"à¹à¸ˆà¹‰à¸‡à¸›à¸±à¸à¸«à¸²à¸­à¸·à¹ˆà¸™",
    todayCalm:"à¸§à¸±à¸™à¸™à¸µà¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¹„à¸”à¹‰à¸ªà¸šà¸²à¸¢", overview:"à¸ à¸²à¸žà¸£à¸§à¸¡à¸à¸°à¸‡à¸²à¸™à¸‚à¸­à¸‡à¸„à¸¸à¸“", tasksWaiting:"à¸‡à¸²à¸™à¸—à¸µà¹ˆà¸£à¸­à¸­à¸¢à¸¹à¹ˆ", allGood:"à¸—à¸¸à¸à¸­à¸¢à¹ˆà¸²à¸‡à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸à¸²à¸£à¸„à¸§à¸šà¸„à¸¸à¸¡"
  }
};

const stays = [
  { room: "Villa 10", guest: "Marta & Luca", time: "15:00", pax: 2, note: "Baby cot requested" },
  { room: "Bungalow 11", guest: "Ivelina Dimitrova", time: "18:00", pax: 2, note: "Good view requested" },
  { room: "Bungalow 12", guest: "Jonas Berg", time: "19:00", pax: 2, note: "Late arrival possible" },
];
const departures = [
  { room: "Bungalow 5", guest: "Anna Keller", time: "10:00", pax: 2, note: "Taxi to ferry at 09:00" },
  { room: "Bungalow 6", guest: "Peter Holm", time: "11:00", pax: 2, note: "Deposit return" },
  { room: "Villa 10", guest: "Marta & Luca", time: "12:00", pax: 2, note: "Time not confirmed" },
];
const initialRooms: { room: string; status: CleanStatus; assigned?: string }[] = [
  { room: "Bungalow 5", status: "Dirty" }, { room: "Bungalow 6", status: "Dirty" },
  { room: "Villa 10", status: "Inspection", assigned: "Nun" },
  { room: "Bungalow 11", status: "In progress", assigned: "Latte" },
  { room: "Bungalow 12", status: "Ready" },
];

function LanguageToggle() {
  const { language, changeLanguage } = useLanguage();
  return <div className="language-switch" aria-label="Language">
    <button className={language === "en" ? "is-active" : ""} onClick={() => changeLanguage("en")}>EN</button>
    <button className={language === "th" ? "is-active" : ""} onClick={() => changeLanguage("th")}>à¹„à¸—à¸¢</button>
  </div>;
}

function DateBar({ date, setDate, t }: { date: string; setDate: (v: string) => void; t: Copy }) {
  return <label className="date-bar"><CalendarIcon/><span>{date === "2026-07-28" ? t.today : t.selectedDate}</span><input aria-label={t.selectDate} type="date" value={date} onChange={(e)=>setDate(e.target.value)} /><ChevronDownIcon/></label>;
}

function Header({ title, onBack, t }: { title: string; onBack?: () => void; t: Copy }) {
  return <header className="ops-header"><div className="ops-header__row">
    <div className="header-title-wrap">{onBack && <button className="icon-button" onClick={onBack} aria-label="Back"><BackIcon/></button>}<div><div className="eyebrow">{t.brand}</div><h1>{title}</h1></div></div>
    <LanguageToggle />
  </div></header>;
}

function Home({ go, t }: { go: (v: View) => void; t: Copy }) {
  return <main className="ops-page home-page">
    <Header title={t.morning} t={t}/>
    <section className="hero-panel">
      <div className="hero-panel__glow" />
      <div className="hero-panel__content"><span className="hero-kicker"><SparkleIcon/>{t.todayCalm}</span><h2>{t.prompt}</h2><p>{t.overview}</p></div>
      <div className="hero-summary"><strong>9</strong><span>{t.tasksWaiting}</span></div>
    </section>

    <section className="action-grid" aria-label="Operational areas">
      <button className="action-widget action-widget--checkin" onClick={()=>go("checkin")}> 
        <div className="widget-top"><span className="widget-icon"><CheckInIcon/></span><span className="widget-arrow"><ArrowRightIcon/></span></div>
        <div className="widget-copy"><span>{t.checkin}</span><strong>3</strong><small>{t.arrivals}</small></div>
        <div className="widget-footer"><span>{t.next}</span><b>15:00 Â· Villa 10</b></div>
      </button>
      <button className="action-widget action-widget--checkout" onClick={()=>go("checkout")}> 
        <div className="widget-top"><span className="widget-icon"><CheckOutIcon/></span><span className="widget-arrow"><ArrowRightIcon/></span></div>
        <div className="widget-copy"><span>{t.checkout}</span><strong>3</strong><small>{t.departures}</small></div>
        <div className="widget-footer"><span>{t.next}</span><b>10:00 Â· Bungalow 5</b></div>
      </button>
      <button className="action-widget action-widget--housekeeping" onClick={()=>go("housekeeping")}> 
        <div className="widget-top"><span className="widget-icon"><HousekeepingIcon/></span><span className="widget-arrow"><ArrowRightIcon/></span></div>
        <div className="widget-copy"><span>{t.housekeeping}</span><strong>2</strong><small>{t.dirty}</small></div>
        <div className="status-dots"><i className="dot-dirty"/><i className="dot-progress"/><i className="dot-inspection"/><i className="dot-ready"/></div>
        <div className="widget-footer split"><b>1 {t.inProgress}</b><b>1 {t.inspection}</b></div>
      </button>
      <button className="action-widget action-widget--maintenance" onClick={()=>go("maintenance")}> 
        <div className="widget-top"><span className="widget-icon"><MaintenanceIcon/></span><span className="widget-arrow"><PlusIcon/></span></div>
        <div className="widget-copy"><span>{t.maintenance}</span><strong className="maintenance-cta">{t.reportProblem}</strong><small>{t.fastSupport}</small></div>
        <div className="widget-footer"><span className="pulse-dot"/><b>1 {t.blocked.toLowerCase()}</b></div>
      </button>
    </section>

    <button className="alert-strip" onClick={()=>go("maintenance")}><span className="alert-strip__icon"><AlertIcon/></span><div><strong>{t.blocked}</strong><span>{t.aircon}</span></div><span className="alert-strip__action">{t.open}<ArrowRightIcon/></span></button>
  </main>;
}

function StayList({ title, data, mode, back, t }: { title: string; data: typeof stays; mode: "in"|"out"; back: ()=>void; t: Copy }) {
  const [date,setDate] = useState("2026-07-28");
  return <main className="ops-page detail-page"><Header title={title} onBack={back} t={t}/><DateBar date={date} setDate={setDate} t={t}/>
    <section className="metric-hero"><div><span>{date === "2026-07-28" ? t.today : t.selectedDate}</span><strong>{data.length}</strong><small>{mode === "in" ? t.arrivals : t.departures}</small></div><div className={`metric-orb ${mode === "out" ? "is-out" : ""}`}>{mode === "in" ? <CheckInIcon/> : <CheckOutIcon/>}</div></section>
    <section className="flow-list">{data.map((item, i)=><article className="flow-card" key={`${item.room}-${i}`}>
      <div className="flow-card__rail"><span>{item.time}</span><i/></div>
      <div className="flow-card__main"><div className="flow-card__top"><div className="room-symbol"><RoomIcon/></div><div><h3>{item.room}</h3><p><UserIcon/>{item.guest}</p></div></div>
        <div className="flow-card__meta"><span>{item.pax} {t.guests}</span><span>{item.note}</span></div>
        <div className="check-row"><label><input type="checkbox"/><span><CheckIcon/>{t.passport}</span></label><label><input type="checkbox"/><span><CheckIcon/>{mode === "in" ? t.depositReceived : t.depositReturned}</span></label></div>
        <button className="primary-action"><CheckIcon/>{mode === "in" ? t.confirmIn : t.confirmOut}</button>
      </div></article>)}</section>
  </main>;
}

function Housekeeping({ back, t }: { back: ()=>void; t: Copy }) {
  const [rooms,setRooms] = useState(initialRooms);
  const counts = useMemo(()=>({ dirty:rooms.filter(r=>r.status==="Dirty").length, progress:rooms.filter(r=>r.status==="In progress").length, inspection:rooms.filter(r=>r.status==="Inspection").length, ready:rooms.filter(r=>r.status==="Ready").length }),[rooms]);
  const advance = (room: string) => setRooms(list=>list.map(r=>r.room===room ? ({...r,status:r.status==="Dirty"?"In progress":r.status==="In progress"?"Inspection":r.status==="Inspection"?"Ready":"Ready",assigned:r.status==="Dirty"?"You":r.assigned}) : r));
  const label = (status: CleanStatus) => status === "Dirty" ? t.dirty : status === "In progress" ? t.inProgress : status === "Inspection" ? t.inspection : t.ready;
  return <main className="ops-page detail-page"><Header title={t.housekeeping} onBack={back} t={t}/>
    <section className="status-grid"><div className="stat dirty"><span/><strong>{counts.dirty}</strong><small>{t.dirty}</small></div><div className="stat progress"><span/><strong>{counts.progress}</strong><small>{t.inProgress}</small></div><div className="stat inspection"><span/><strong>{counts.inspection}</strong><small>{t.inspection}</small></div><div className="stat ready"><span/><strong>{counts.ready}</strong><small>{t.ready}</small></div></section>
    <div className="queue-heading"><div><span className="eyebrow">{t.workQueue}</span><h2>{t.roomsPrepare}</h2></div><span>{rooms.length} {t.rooms}</span></div>
    <section className="house-list">{rooms.map(room=><article className="house-card" key={room.room}>
      <div className="house-card__icon"><HousekeepingIcon/></div><div className="house-card__body"><h3>{room.room}</h3><div className={`status-pill status-${room.status.toLowerCase().replace(" ","-")}`}>{label(room.status)}</div>{room.assigned && <p>{t.assignedTo} <strong>{room.assigned}</strong></p>}</div>
      {room.status!=="Ready" ? <button onClick={()=>advance(room.room)}>{room.status==="Dirty"?t.takeRoom:room.status==="In progress"?t.sendInspection:t.markReady}</button> : <span className="ready-check"><CheckIcon/></span>}
    </article>)}</section>
  </main>;
}

function Maintenance({ back, t }: { back: ()=>void; t: Copy }) {
  const [submitted,setSubmitted] = useState(false);
  return <main className="ops-page detail-page"><Header title={t.maintenance} onBack={back} t={t}/>
    {!submitted ? <form className="maintenance-form" onSubmit={(e)=>{e.preventDefault();setSubmitted(true)}}>
      <section className="form-hero"><div className="form-hero__icon"><MaintenanceIcon/></div><div><span>{t.fastSupport}</span><h2>{t.reportProblem}</h2></div></section>
      <label className="field"><span>{t.roomArea}</span><div className="select-shell"><RoomIcon/><select required defaultValue=""><option value="" disabled>{t.selectPlace}</option><option>Villa 10</option><option>Bungalow 1</option><option>Bungalow 5</option><option>Bungalow 6</option><option>Bungalow 7</option><option>Restaurant</option><option>Garden</option><option>Reception</option></select><ChevronDownIcon/></div></label>
      <fieldset className="choice-field"><legend>{t.problemType}</legend><div className="choice-grid">{["Air-con","Bathroom","Electric","Furniture","Water","Other"].map(x=><label key={x}><input type="radio" name="type" required/><span>{x}</span></label>)}</div></fieldset>
      <fieldset className="choice-field"><legend>{t.urgency}</legend><div className="urgency-row"><label><input type="radio" name="urgency" defaultChecked/><span>{t.normal}</span></label><label><input type="radio" name="urgency"/><span>{t.urgent}</span></label></div></fieldset>
      <label className="field"><span>{t.shortNote}</span><textarea rows={3} placeholder={t.notePlaceholder}/></label>
      <label className="upload-button"><span className="upload-icon"><CameraIcon/></span><span><strong>{t.addPhoto}</strong><small>{t.photoHelper}</small></span><PlusIcon/><input type="file" accept="image/*" capture="environment"/></label>
      <button className="submit-button" type="submit">{t.sendMaintenance}<ArrowRightIcon/></button>
    </form> : <section className="success-card"><div><CheckIcon/></div><span>{t.allGood}</span><h2>{t.problemSent}</h2><p>{t.sentHelper}</p><button onClick={()=>setSubmitted(false)}>{t.reportAnother}</button></section>}
  </main>;
}

export default function OpsMvpPage(){
  const [view,setView]=useState<View>("home");
  const { language } = useLanguage();
  const t = copy[language];
  const back=()=>setView("home");
  if(view==="checkin") return <StayList title={t.checkin} data={stays} mode="in" back={back} t={t}/>;
  if(view==="checkout") return <StayList title={t.checkout} data={departures} mode="out" back={back} t={t}/>;
  if(view==="housekeeping") return <Housekeeping back={back} t={t}/>;
  if(view==="maintenance") return <Maintenance back={back} t={t}/>;
  return <Home go={setView} t={t}/>;
}
