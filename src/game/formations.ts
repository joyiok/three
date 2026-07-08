import type { GameState, SoldierKind } from './types';

export type FormationKind = 'vanguard' | 'volley' | 'loyalGuard' | 'fiveForces';

export interface FormationDef {
  kind: FormationKind;
  name: string;
  desc: string;
}

export const FORMATIONS: Record<FormationKind, FormationDef> = {
  vanguard: {
    kind: 'vanguard',
    name: '锋骑突阵',
    desc: '刀/骑伤害 +12%',
  },
  volley: {
    kind: 'volley',
    name: '枪弓连营',
    desc: '枪/弓伤害 +12%',
  },
  loyalGuard: {
    kind: 'loyalGuard',
    name: '双忠护营',
    desc: '漏怪伤害 -1',
  },
  fiveForces: {
    kind: 'fiveForces',
    name: '五军合势',
    desc: '全军伤害 +20%',
  },
};

function deployedKinds(gs: GameState): Set<SoldierKind> {
  return new Set(gs.soldiers.filter((s) => s.cell).map((s) => s.kind));
}

export function activeFormations(gs: GameState): FormationDef[] {
  const kinds = deployedKinds(gs);
  const loyalCount = gs.soldiers.filter((s) => s.cell && s.kind === '忠').length;
  const out: FormationDef[] = [];
  if (kinds.has('刀') && kinds.has('骑')) out.push(FORMATIONS.vanguard);
  if (kinds.has('枪') && kinds.has('弓')) out.push(FORMATIONS.volley);
  if (loyalCount >= 2) out.push(FORMATIONS.loyalGuard);
  if ((['刀', '枪', '弓', '骑', '忠'] as SoldierKind[]).every((k) => kinds.has(k))) {
    out.push(FORMATIONS.fiveForces);
  }
  return out;
}

export function formationDamageMultiplier(gs: GameState, kind: SoldierKind): number {
  const active = new Set(activeFormations(gs).map((f) => f.kind));
  let mult = active.has('fiveForces') ? 1.2 : 1;
  if (active.has('vanguard') && (kind === '刀' || kind === '骑')) mult *= 1.12;
  if (active.has('volley') && (kind === '枪' || kind === '弓')) mult *= 1.12;
  return mult;
}

export function formationLeakDamage(gs: GameState, rawDamage: number): number {
  const hasGuard = activeFormations(gs).some((f) => f.kind === 'loyalGuard');
  return hasGuard ? Math.max(1, rawDamage - 1) : rawDamage;
}

export function formationHint(gs: GameState): string {
  const kinds = deployedKinds(gs);
  const loyalCount = gs.soldiers.filter((s) => s.cell && s.kind === '忠').length;
  if (!kinds.has('骑') && kinds.has('刀')) return '再布「骑」可成锋骑突阵';
  if (!kinds.has('刀') && kinds.has('骑')) return '再布「刀」可成锋骑突阵';
  if (!kinds.has('弓') && kinds.has('枪')) return '再布「弓」可成枪弓连营';
  if (!kinds.has('枪') && kinds.has('弓')) return '再布「枪」可成枪弓连营';
  if (loyalCount === 1) return '再布 1 个「忠」可成双忠护营';
  const missing = (['刀', '枪', '弓', '骑', '忠'] as SoldierKind[]).filter((k) => !kinds.has(k));
  if (missing.length > 0 && kinds.size >= 3) return `再布「${missing[0]}」迈向五军合势`;
  return '混搭兵种可激活阵法加成';
}
