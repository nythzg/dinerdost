import {getDatabase} from '@dinerdost/database';
import {platformPublicBrand} from '@dinerdost/services';
import Link from 'next/link';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function BrandPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;let data;try{data=await platformPublicBrand(await getDatabase(),slug)}catch{return notFound()}return <main style={{maxWidth:850,margin:'40px auto',padding:24}}>{data.logoId&&<img alt={data.name+' logo'} src={'/api/superadmin/files?type=brand&id='+data.logoId} width={96} height={96} style={{objectFit:'contain'}}/>}<h1 style={{color:data.color}}>{data.name}</h1><p>Choose an outlet</p><div className="card-grid">{data.outlets.map((outlet:any)=><article className="card" key={outlet.id}><h2>{outlet.name}</h2>{outlet.storefront?<Link className="button primary" href={'/store/'+outlet.storefront}>View menu</Link>:<p>Online ordering is not published for this outlet.</p>}</article>)}</div></main>}
