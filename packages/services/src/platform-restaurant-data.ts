import {z} from 'zod';
import type {Sql} from '@dinerdost/database';

export const platformDataset=z.enum(['all','demo','nonDemo','withOrders']);
export type PlatformDataset=z.infer<typeof platformDataset>;

// Dataset labels describe stored facts, never whether a business is genuine.
export const restaurantScope=`($1='all' OR ($1='demo' AND r.is_demo) OR ($1='nonDemo' AND NOT r.is_demo) OR ($1='withOrders' AND EXISTS(SELECT 1 FROM orders q WHERE q.restro_id=r.id)))`;

export async function restaurantDatasetCounts(tx:Sql){
 return (await tx.query(`SELECT count(*) AS all_records,count(*) FILTER(WHERE is_demo) AS demo,
  count(*) FILTER(WHERE NOT is_demo) AS non_demo,
  count(*) FILTER(WHERE EXISTS(SELECT 1 FROM orders q WHERE q.restro_id=r.id)) AS with_orders FROM restaurants r`)).rows[0];
}
