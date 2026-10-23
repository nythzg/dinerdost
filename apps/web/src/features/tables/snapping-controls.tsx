"use client";
import {type SnapGuide,type SnapSettings} from './floor-snapping';

export function SnappingControls({value,change}:{value:SnapSettings;change:(value:SnapSettings)=>void}){
 return <details className="floor-snapping-controls"><summary>Snapping</summary><div>
  <label><input type="checkbox" checked={value.enabled!==false} onChange={e=>change({...value,enabled:e.target.checked})}/>Enable snapping</label>
  <label><input type="checkbox" checked={value.snapToGrid} onChange={e=>change({...value,snapToGrid:e.target.checked})}/>Grid</label>
  <label>Grid size<input aria-label="Snap grid size" type="number" min="1" max="100" value={value.gridSize} onChange={e=>change({...value,gridSize:Math.max(1,Math.min(100,Number(e.target.value)||1))})}/></label>
  <label><input type="checkbox" checked={value.snapToPixel} onChange={e=>change({...value,snapToPixel:e.target.checked})}/>Pixel grid</label>
  <label><input type="checkbox" checked={value.smartGuides} onChange={e=>change({...value,smartGuides:e.target.checked})}/>Smart guides</label>
  <small>4px pointer tolerance at any zoom. Hold Alt to bypass snapping.</small>
 </div></details>;
}
export function SnapGuides({guides,view}:{guides:SnapGuide[];view:{x:number;y:number;width:number;height:number}}){
 if(!guides.length)return null;
 return <svg className="floor-snap-guides" aria-label="Snapping guides">{guides.map((guide,i)=><line key={i} data-snap-source={guide.source} x1={guide.type==='vertical'?guide.position:view.x} y1={guide.type==='horizontal'?guide.position:view.y} x2={guide.type==='vertical'?guide.position:view.x+view.width} y2={guide.type==='horizontal'?guide.position:view.y+view.height} vectorEffect="non-scaling-stroke"><title>{guide.source}</title></line>)}</svg>;
}
