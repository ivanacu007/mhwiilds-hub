import {
  ARMOR_KINDS,
  type ArmorKind,
  type ArmorPiece,
  type Catalog,
  type CatalogIndex,
  type Decoration,
} from '../catalog/types.ts';
import type {
  PlacedDecoration,
  SkillTarget,
  SolutionPiece,
  Solution,
  SolveRequest,
  SolveResponse,
} from './types.ts';

/** Tamaños de slot posibles en Wilds: 1, 2 y 3. */
const SLOT_SIZES = 3;
type SlotCounts = [number, number, number];

/** Candidato ya digerido: se precalcula todo lo que el DFS consulta en caliente. */
interface Candidate {
  piece: ArmorPiece;
  /** Aporte a cada objetivo, en el mismo orden que `targets`. */
  contrib: number[];
  slots: SlotCounts;
  setId: number | null;
  groupId: number | null;
}

interface Prepared {
  targets: SkillTarget[];
  candidates: Record<ArmorKind, Candidate[]>;
  /** Cota superior de aporte por ranura, para podar. */
  maxContribByKind: Record<ArmorKind, number[]>;
  maxBonus: number[];
  maxCharm: number[];
  maxDecoLevel: number[];
  maxWeaponDecoLevel: number[];
  charmOptions: { charmId: number; level: number; contrib: number[] }[];
  /** Adornos de armadura poseídos que sirven para algún objetivo. */
  armorDecos: DecoOption[];
  weaponDecos: DecoOption[];
}

interface DecoOption {
  decoration: Decoration;
  /** Aporte a cada objetivo. */
  contrib: number[];
  owned: number;
  slot: number;
}

function toSlotCounts(slots: number[]): SlotCounts {
  const counts: SlotCounts = [0, 0, 0];
  for (const size of slots) {
    if (size >= 1 && size <= SLOT_SIZES) counts[size - 1] += 1;
  }
  return counts;
}

function addSlots(a: SlotCounts, b: SlotCounts): SlotCounts {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Mete un adorno en la ranura libre más chica donde quepa. Devuelve el tamaño usado. */
function takeSlot(counts: SlotCounts, size: number): number {
  for (let s = size; s <= SLOT_SIZES; s++) {
    if (counts[s - 1] > 0) {
      counts[s - 1] -= 1;
      return s;
    }
  }
  return 0;
}

function totalSlots(counts: SlotCounts): number {
  return counts[0] + counts[1] + counts[2];
}

/**
 * Prepara el problema: recorta el catálogo a lo que puede importar y precalcula
 * vectores de aporte. Es lo que hace que el DFS después vuele.
 */
function prepare(request: SolveRequest, index: CatalogIndex): Prepared {
  const catalog = index.catalog;
  const targets = request.targets;
  const T = targets.length;
  const targetPos = new Map<number, number>();
  targets.forEach((t, i) => targetPos.set(t.skillId, i));

  const zero = () => new Array<number>(T).fill(0);

  // --- Bonus de serie y grupo que tocan algún objetivo ---
  const maxBonus = zero();
  /** setId -> [{pieces, targetIndex, level}] */
  const setBonusIndex = new Map<number, { pieces: number; ti: number; level: number }[]>();
  const groupBonusIndex = new Map<number, { pieces: number; ti: number; level: number }[]>();
  /** Series y grupos cuyo bonus vale la pena perseguir. */
  const relevantSets = new Set<number>();
  const relevantGroups = new Set<number>();

  for (const set of catalog.armorSets) {
    for (const bonus of set.setBonus) {
      const ti = targetPos.get(bonus.skillId);
      if (ti === undefined) continue;
      if (!setBonusIndex.has(set.id)) setBonusIndex.set(set.id, []);
      setBonusIndex.get(set.id)!.push({ pieces: bonus.pieces, ti, level: bonus.level });
      maxBonus[ti] = Math.max(maxBonus[ti], bonus.level);
      relevantSets.add(set.id);
    }
    if (set.groupId != null) {
      for (const bonus of set.groupBonus) {
        const ti = targetPos.get(bonus.skillId);
        if (ti === undefined) continue;
        if (!groupBonusIndex.has(set.groupId)) groupBonusIndex.set(set.groupId, []);
        const list = groupBonusIndex.get(set.groupId)!;
        // Varias series comparten grupo: el bonus se registra una sola vez.
        if (!list.some((b) => b.pieces === bonus.pieces && b.ti === ti)) {
          list.push({ pieces: bonus.pieces, ti, level: bonus.level });
        }
        maxBonus[ti] = Math.max(maxBonus[ti], bonus.level);
        relevantGroups.add(set.groupId);
      }
    }
  }

  // --- Adornos poseídos ---
  const buildDecoOptions = (kind: 'armor' | 'weapon'): DecoOption[] => {
    const out: DecoOption[] = [];
    for (const deco of catalog.decorations) {
      if (deco.kind !== kind) continue;
      const owned = request.inventory.decorations[String(deco.id)] ?? 0;
      if (owned <= 0) continue;
      const contrib = zero();
      let useful = false;
      for (const grant of deco.skills) {
        const ti = targetPos.get(grant.skillId);
        if (ti === undefined) continue;
        contrib[ti] += grant.level;
        useful = true;
      }
      if (!useful) continue;
      out.push({ decoration: deco, contrib, owned, slot: deco.slot });
    }
    // Primero los que más aportan y ocupan ranura más chica.
    out.sort((a, b) => {
      const sumA = a.contrib.reduce((x, y) => x + y, 0);
      const sumB = b.contrib.reduce((x, y) => x + y, 0);
      if (sumB !== sumA) return sumB - sumA;
      return a.slot - b.slot;
    });
    return out;
  };

  const armorDecos = buildDecoOptions('armor');
  const weaponDecos = buildDecoOptions('weapon');

  const maxDecoLevel = zero();
  for (const option of armorDecos) {
    for (let i = 0; i < T; i++) maxDecoLevel[i] = Math.max(maxDecoLevel[i], option.contrib[i]);
  }
  const maxWeaponDecoLevel = zero();
  for (const option of weaponDecos) {
    for (let i = 0; i < T; i++) {
      maxWeaponDecoLevel[i] = Math.max(maxWeaponDecoLevel[i], option.contrib[i]);
    }
  }

  // --- Piezas candidatas por ranura ---
  const ownedArmor = request.inventory.armor ? new Set(request.inventory.armor) : null;
  const candidates = {} as Record<ArmorKind, Candidate[]>;
  const maxContribByKind = {} as Record<ArmorKind, number[]>;

  const candidateOf = (piece: ArmorPiece): Candidate => {
    const contrib = zero();
    for (const grant of piece.skills) {
      const ti = targetPos.get(grant.skillId);
      if (ti !== undefined) contrib[ti] += grant.level;
    }
    const set = piece.setId != null ? index.armorSetById.get(piece.setId) : undefined;
    return {
      piece,
      contrib,
      slots: toSlotCounts(piece.slots),
      setId: piece.setId,
      groupId: set?.groupId ?? null,
    };
  };

  for (const kind of ARMOR_KINDS) {
    // Ranura fijada: esa pieza y ninguna otra. Se salta el inventario, el rango,
    // el filtro de "aporta algo" y la poda por dominancia — si la fijaste es
    // porque la quieres puesta, aunque no sume a ningún objetivo.
    const lockedId = request.locked?.[kind];
    const lockedPiece = lockedId != null ? index.armorById.get(lockedId) : undefined;
    if (lockedPiece && lockedPiece.kind === kind) {
      const only = candidateOf(lockedPiece);
      candidates[kind] = [only];
      maxContribByKind[kind] = only.contrib.slice();
      continue;
    }

    const list: Candidate[] = [];
    for (const piece of index.armorByKind[kind]) {
      if (ownedArmor && !ownedArmor.has(piece.id)) continue;
      if (request.rank !== 'all' && piece.rank !== request.rank) continue;

      const contrib = zero();
      let useful = false;
      for (const grant of piece.skills) {
        const ti = targetPos.get(grant.skillId);
        if (ti === undefined) continue;
        contrib[ti] += grant.level;
        useful = true;
      }

      const slots = toSlotCounts(piece.slots);
      const setRelevant = piece.setId != null && relevantSets.has(piece.setId);
      const set = piece.setId != null ? index.armorSetById.get(piece.setId) : undefined;
      const groupId = set?.groupId ?? null;
      const groupRelevant = groupId != null && relevantGroups.has(groupId);

      // Una pieza entra si aporta habilidad, si trae ranuras donde meter
      // adornos útiles, o si suma para un bonus de serie/grupo que buscamos.
      if (!useful && totalSlots(slots) === 0 && !setRelevant && !groupRelevant) continue;

      list.push({ piece, contrib, slots, setId: piece.setId, groupId });
    }

    candidates[kind] = prune(list, T, relevantSets, relevantGroups);

    const max = zero();
    for (const candidate of candidates[kind]) {
      for (let i = 0; i < T; i++) max[i] = Math.max(max[i], candidate.contrib[i]);
    }
    maxContribByKind[kind] = max;
  }

  // --- Talismanes ---
  const charmOptions: { charmId: number; level: number; contrib: number[] }[] = [];
  const maxCharm = zero();
  for (const charm of catalog.charms) {
    const ownedLevel = request.inventory.charms[String(charm.id)] ?? 0;
    if (ownedLevel <= 0) continue;
    // Solo el rango más alto forjado: los inferiores nunca son mejores.
    const rank = charm.ranks.filter((r) => r.level <= ownedLevel).at(-1);
    if (!rank) continue;

    const contrib = zero();
    let useful = false;
    for (const grant of rank.skills) {
      const ti = targetPos.get(grant.skillId);
      if (ti === undefined) continue;
      contrib[ti] += grant.level;
      useful = true;
    }
    if (!useful) continue;
    charmOptions.push({ charmId: charm.id, level: rank.level, contrib });
    for (let i = 0; i < T; i++) maxCharm[i] = Math.max(maxCharm[i], contrib[i]);
  }

  return {
    targets,
    candidates,
    maxContribByKind,
    maxBonus,
    maxCharm,
    maxDecoLevel,
    maxWeaponDecoLevel,
    charmOptions,
    armorDecos,
    weaponDecos,
  };
}

/**
 * Descarta piezas que otra domina: si B aporta lo mismo o menos en todos los
 * objetivos, tiene ranuras que caben en las de A y menos defensa, B nunca va a
 * aparecer en una solución que A no mejore.
 *
 * No se aplica a piezas de series o grupos que buscamos, porque ahí el valor de
 * la pieza no está en lo que da por sí sola sino en que suma para el bonus.
 */
function prune(
  list: Candidate[],
  T: number,
  relevantSets: Set<number>,
  relevantGroups: Set<number>,
): Candidate[] {
  const protectedPieces: Candidate[] = [];
  const prunable: Candidate[] = [];

  for (const candidate of list) {
    const inRelevantSet = candidate.setId != null && relevantSets.has(candidate.setId);
    const inRelevantGroup = candidate.groupId != null && relevantGroups.has(candidate.groupId);
    if (inRelevantSet || inRelevantGroup) protectedPieces.push(candidate);
    else prunable.push(candidate);
  }

  // Ranuras acumuladas desde el tamaño mayor: así se compara "capacidad real",
  // porque una ranura de 3 puede alojar cualquier adorno de 1 o 2.
  const cumulative = (slots: SlotCounts): [number, number, number] => [
    slots[2],
    slots[2] + slots[1],
    slots[2] + slots[1] + slots[0],
  ];

  const kept: Candidate[] = [];
  for (const a of prunable) {
    const cumA = cumulative(a.slots);
    let dominated = false;

    for (const b of prunable) {
      if (a === b) continue;
      const cumB = cumulative(b.slots);

      let bAtLeastAsGood = true;
      for (let i = 0; i < T; i++) {
        if (b.contrib[i] < a.contrib[i]) { bAtLeastAsGood = false; break; }
      }
      if (!bAtLeastAsGood) continue;
      if (cumB[0] < cumA[0] || cumB[1] < cumA[1] || cumB[2] < cumA[2]) continue;
      if (b.piece.defense < a.piece.defense) continue;

      // Empate perfecto: se conserva una sola, la de id menor.
      const identical =
        cumB[0] === cumA[0] && cumB[1] === cumA[1] && cumB[2] === cumA[2] &&
        b.piece.defense === a.piece.defense &&
        a.contrib.every((v, i) => v === b.contrib[i]);
      if (identical && b.piece.id > a.piece.id) continue;

      dominated = true;
      break;
    }

    if (!dominated) kept.push(a);
  }

  return [...protectedPieces, ...kept];
}

/**
 * Intenta cubrir los déficits con los adornos disponibles y las ranuras libres.
 * Devuelve qué adornos usar, o null si no alcanza.
 */
function fillDecorations(
  deficits: number[],
  slots: SlotCounts,
  options: DecoOption[],
  used: Map<number, number>,
): Map<number, number> | null {
  const remaining = deficits.slice();
  const available = slots.slice() as SlotCounts;
  const chosen = new Map<number, number>();

  const anyLeft = () => remaining.some((d) => d > 0);

  const step = (): boolean => {
    if (!anyLeft()) return true;
    if (totalSlots(available) === 0) return false;

    // Se ataca primero el objetivo con más déficit: falla antes si no hay salida.
    let worst = -1;
    let worstValue = 0;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] > worstValue) { worstValue = remaining[i]; worst = i; }
    }
    if (worst < 0) return true;

    for (const option of options) {
      if (option.contrib[worst] <= 0) continue;

      const alreadyUsed = (used.get(option.decoration.id) ?? 0) + (chosen.get(option.decoration.id) ?? 0);
      if (alreadyUsed >= option.owned) continue;

      const takenSize = takeSlot(available, option.slot);
      if (takenSize === 0) continue;

      const before = remaining.slice();
      for (let i = 0; i < remaining.length; i++) {
        remaining[i] = Math.max(0, remaining[i] - option.contrib[i]);
      }
      chosen.set(option.decoration.id, (chosen.get(option.decoration.id) ?? 0) + 1);

      if (step()) return true;

      // Deshacer
      chosen.set(option.decoration.id, chosen.get(option.decoration.id)! - 1);
      if (chosen.get(option.decoration.id) === 0) chosen.delete(option.decoration.id);
      for (let i = 0; i < remaining.length; i++) remaining[i] = before[i];
      available[takenSize - 1] += 1;
    }

    return false;
  };

  return step() ? chosen : null;
}

export function solve(request: SolveRequest, index: CatalogIndex): SolveResponse {
  const startedAt = Date.now();

  if (request.targets.length === 0) {
    return { ok: true, solutions: [], searched: 0, elapsedMs: 0, truncated: false };
  }

  // Sin arma equipada, cualquier objetivo de habilidad de arma es inalcanzable
  // por construcción. Vale más decirlo que buscar en vano y reportar "no hay".
  if (request.weaponId == null) {
    const weaponSkills = request.targets.filter(
      (t) => index.skillById.get(t.skillId)?.kind === 'weapon',
    );
    if (weaponSkills.length > 0) {
      return { ok: false, reason: 'falta-arma', weaponSkills, elapsedMs: Date.now() - startedAt };
    }
  }

  const prepared = prepare(request, index);
  const T = prepared.targets.length;
  const need = prepared.targets.map((t) => t.level);

  const weapon = request.weaponId != null ? index.weaponById.get(request.weaponId) ?? null : null;
  const weaponSlots = weapon ? toSlotCounts(weapon.slots) : ([0, 0, 0] as SlotCounts);

  // Lo que el arma ya regala, antes de empezar a buscar armadura.
  const base = new Array<number>(T).fill(0);
  if (weapon) {
    prepared.targets.forEach((target, i) => {
      for (const grant of weapon.skills) {
        if (grant.skillId === target.skillId) base[i] += grant.level;
      }
    });
  }

  const solutions: Solution[] = [];
  const seen = new Set<string>();
  let searched = 0;
  let truncated = false;

  /**
   * Cortar al juntar `maxResults` devolvería las primeras soluciones, no las
   * mejores: el orden en que el DFS visita las piezas no tiene nada que ver con
   * su calidad. Así que se explora hasta agotar el presupuesto de tiempo y se
   * conservan las mejores por puntaje, recortando la lista cuando crece.
   */
  const KEEP = Math.max(request.maxResults * 20, 200);
  let scoreFloor = -Infinity;

  const trimSolutions = () => {
    if (solutions.length < KEEP) return;
    solutions.sort((a, b) => b.score - a.score);
    solutions.length = request.maxResults * 4;
    scoreFloor = solutions[solutions.length - 1].score;
  };
  let bestShortfall = Infinity;
  let bestUnreachable: SkillTarget[] = prepared.targets.slice();

  const kinds = ARMOR_KINDS;
  const chosen: (Candidate | null)[] = new Array(kinds.length).fill(null);

  const outOfTime = () => Date.now() - startedAt > request.timeBudgetMs;

  /** Cota optimista: si ni así se llega, la rama no sirve. */
  const canStillReach = (acc: number[], depth: number, slots: SlotCounts): boolean => {
    const remainingKinds = kinds.length - depth;
    for (let i = 0; i < T; i++) {
      if (acc[i] >= need[i]) continue;
      let best = acc[i] + prepared.maxBonus[i] + prepared.maxCharm[i];
      for (let d = depth; d < kinds.length; d++) {
        best += prepared.maxContribByKind[kinds[d]][i];
      }
      // Cada ranura futura o libre podría llevar el mejor adorno para este objetivo.
      const futureSlots = totalSlots(slots) + remainingKinds * 3;
      best += futureSlots * prepared.maxDecoLevel[i];
      // Las ranuras del arma tiran de otro catálogo de adornos; omitirlas
      // haría podar ramas donde el arma sí completaba el objetivo.
      best += totalSlots(weaponSlots) * prepared.maxWeaponDecoLevel[i];
      if (best < need[i]) return false;
    }
    return true;
  };

  const materialize = (charm: { charmId: number; level: number; contrib: number[] } | null) => {
    // Suma de habilidades propias + bonus de serie/grupo.
    const totals = base.slice();
    const setCounts = new Map<number, number>();
    const groupCounts = new Map<number, number>();
    let defense = 0;
    const resistances: Record<string, number> = {};

    for (let d = 0; d < kinds.length; d++) {
      const candidate = chosen[d]!;
      for (let i = 0; i < T; i++) totals[i] += candidate.contrib[i];
      defense += candidate.piece.defense;
      for (const [element, value] of Object.entries(candidate.piece.resistances)) {
        resistances[element] = (resistances[element] ?? 0) + value;
      }
      if (candidate.setId != null) {
        setCounts.set(candidate.setId, (setCounts.get(candidate.setId) ?? 0) + 1);
      }
      if (candidate.groupId != null) {
        groupCounts.set(candidate.groupId, (groupCounts.get(candidate.groupId) ?? 0) + 1);
      }
    }
    if (charm) for (let i = 0; i < T; i++) totals[i] += charm.contrib[i];

    const bonusSkills: Record<number, number> = {};
    for (const [setId, count] of setCounts) {
      const set = index.armorSetById.get(setId);
      if (!set) continue;
      for (const bonus of set.setBonus) {
        if (count < bonus.pieces) continue;
        bonusSkills[bonus.skillId] = Math.max(bonusSkills[bonus.skillId] ?? 0, bonus.level);
      }
    }
    for (const [groupId, count] of groupCounts) {
      const set = index.catalog.armorSets.find((s) => s.groupId === groupId);
      if (!set) continue;
      for (const bonus of set.groupBonus) {
        if (count < bonus.pieces) continue;
        bonusSkills[bonus.skillId] = Math.max(bonusSkills[bonus.skillId] ?? 0, bonus.level);
      }
    }
    prepared.targets.forEach((target, i) => {
      if (bonusSkills[target.skillId]) totals[i] += bonusSkills[target.skillId];
    });

    // Déficit que tienen que tapar los adornos.
    const deficits = new Array<number>(T);
    let shortfall = 0;
    for (let i = 0; i < T; i++) {
      deficits[i] = Math.max(0, need[i] - totals[i]);
      shortfall += deficits[i];
    }

    let armorSlots: SlotCounts = [0, 0, 0];
    for (const candidate of chosen) armorSlots = addSlots(armorSlots, candidate!.slots);

    // Los adornos de arma solo entran en el arma, así que se resuelven aparte.
    const weaponUsed = new Map<number, number>();
    let weaponFill: Map<number, number> | null = new Map();
    if (shortfall > 0 && totalSlots(weaponSlots) > 0) {
      weaponFill = fillDecorations(deficits, weaponSlots, prepared.weaponDecos, weaponUsed);
      if (weaponFill) {
        for (const [decoId, count] of weaponFill) {
          const option = prepared.weaponDecos.find((o) => o.decoration.id === decoId)!;
          for (let i = 0; i < T; i++) deficits[i] = Math.max(0, deficits[i] - option.contrib[i] * count);
        }
      } else {
        weaponFill = new Map();
      }
    }

    const stillNeeded = deficits.reduce((a, b) => a + b, 0);
    const armorFill =
      stillNeeded > 0
        ? fillDecorations(deficits, armorSlots, prepared.armorDecos, new Map())
        : new Map<number, number>();

    if (!armorFill) {
      // Rama fallida: sirve para reportar qué quedó sin cubrir.
      if (shortfall < bestShortfall) {
        bestShortfall = shortfall;
        bestUnreachable = prepared.targets.filter((_, i) => deficits[i] > 0);
      }
      return;
    }

    // Reparto concreto: adorno más grande primero, a la ranura libre más chica.
    const placeInto = (
      fill: Map<number, number>,
      pools: { key: string; slots: number[]; placed: PlacedDecoration[] }[],
    ) => {
      const flat: number[] = [];
      for (const [decoId, count] of fill) for (let i = 0; i < count; i++) flat.push(decoId);
      flat.sort((a, b) => (index.decorationById.get(b)!.slot - index.decorationById.get(a)!.slot));

      for (const decoId of flat) {
        const size = index.decorationById.get(decoId)!.slot;
        let bestPool = -1;
        let bestIdx = -1;
        let bestSize = Infinity;
        for (let p = 0; p < pools.length; p++) {
          const pool = pools[p];
          for (let s = 0; s < pool.slots.length; s++) {
            if (pool.slots[s] >= size && pool.slots[s] < bestSize) {
              bestSize = pool.slots[s];
              bestPool = p;
              bestIdx = s;
            }
          }
        }
        if (bestPool < 0) return false;
        pools[bestPool].slots[bestIdx] = -1; // ocupada
        pools[bestPool].placed.push({ slotIndex: bestIdx, decorationId: decoId });
      }
      return true;
    };

    const armorPools = kinds.map((kind, d) => ({
      key: kind,
      slots: chosen[d]!.piece.slots.slice(),
      placed: [] as PlacedDecoration[],
    }));
    if (!placeInto(armorFill, armorPools)) return;

    const weaponPool = [{ key: 'weapon', slots: weapon ? weapon.slots.slice() : [], placed: [] as PlacedDecoration[] }];
    if (!placeInto(weaponFill, weaponPool)) return;

    const key = kinds.map((_, d) => chosen[d]!.piece.id).join('-') + `|${charm?.charmId ?? 0}`;
    if (seen.has(key)) return;
    // El set de vistos no puede crecer sin techo en búsquedas largas.
    if (seen.size < 200_000) seen.add(key);

    const pieces = {} as Record<ArmorKind, SolutionPiece>;
    kinds.forEach((kind, d) => {
      pieces[kind] = { armorId: chosen[d]!.piece.id, decorations: armorPools[d].placed };
    });

    // Habilidades finales, ya contando los adornos colocados.
    const achieved: Record<number, number> = { ...bonusSkills };
    const bump = (skillId: number, level: number) => {
      achieved[skillId] = (achieved[skillId] ?? 0) + level;
    };
    if (weapon) for (const g of weapon.skills) bump(g.skillId, g.level);
    for (const candidate of chosen) for (const g of candidate!.piece.skills) bump(g.skillId, g.level);
    if (charm) {
      const charmDoc = index.charmById.get(charm.charmId);
      const rank = charmDoc?.ranks.find((r) => r.level === charm.level);
      if (rank) for (const g of rank.skills) bump(g.skillId, g.level);
    }
    for (const pool of [...armorPools, ...weaponPool]) {
      for (const placed of pool.placed) {
        const deco = index.decorationById.get(placed.decorationId);
        if (deco) for (const g of deco.skills) bump(g.skillId, g.level);
      }
    }

    // Ninguna habilidad pasa de su nivel máximo, por más que se apilen fuentes.
    for (const skillId of Object.keys(achieved)) {
      const skill = index.skillById.get(Number(skillId));
      if (!skill) continue;
      const max = skill.ranks.reduce((m, r) => Math.max(m, r.level), 0);
      achieved[Number(skillId)] = Math.min(achieved[Number(skillId)], max);
    }

    const freeArmor: number[] = [];
    for (const pool of armorPools) for (const size of pool.slots) if (size > 0) freeArmor.push(size);
    const freeWeapon: number[] = [];
    for (const size of weaponPool[0].slots) if (size > 0) freeWeapon.push(size);

    const slotValue = [...freeArmor, ...freeWeapon].reduce((a, b) => a + b, 0);
    const score = defense + slotValue * 8;
    if (score < scoreFloor) return;

    solutions.push({
      pieces,
      charmId: charm?.charmId ?? null,
      charmLevel: charm?.level ?? null,
      weaponId: weapon?.id ?? null,
      weaponDecorations: weaponPool[0].placed,
      skills: achieved,
      defense,
      resistances,
      freeArmorSlots: freeArmor.sort((a, b) => b - a),
      freeWeaponSlots: freeWeapon.sort((a, b) => b - a),
      score,
    });
    trimSolutions();
  };

  const dfs = (depth: number, acc: number[], slots: SlotCounts): void => {
    if (outOfTime()) {
      truncated = true;
      return;
    }

    if (depth === kinds.length) {
      searched += 1;
      materialize(null);
      for (const charm of prepared.charmOptions) {
        if (outOfTime()) { truncated = true; return; }
        materialize(charm);
      }
      return;
    }

    for (const candidate of prepared.candidates[kinds[depth]]) {
      if (outOfTime()) {
        truncated = true;
        return;
      }

      const next = acc.slice();
      for (let i = 0; i < T; i++) next[i] += candidate.contrib[i];
      const nextSlots = addSlots(slots, candidate.slots);

      if (!canStillReach(next, depth + 1, nextSlots)) continue;

      chosen[depth] = candidate;
      dfs(depth + 1, next, nextSlots);
      chosen[depth] = null;
    }
  };

  dfs(0, base, [0, 0, 0]);

  const elapsedMs = Date.now() - startedAt;

  if (solutions.length === 0) {
    return {
      ok: false,
      reason: 'sin-solucion',
      unreachable: bestUnreachable.length ? bestUnreachable : prepared.targets,
      missingDecorations: suggestMissingDecorations(request, index, bestUnreachable),
      elapsedMs,
    };
  }

  solutions.sort((a, b) => b.score - a.score);
  return {
    ok: true,
    solutions: solutions.slice(0, request.maxResults),
    searched,
    elapsedMs,
    truncated,
  };
}

/**
 * Cuando no hay solución, dice qué adornos taparían el hueco. Es deliberadamente
 * simple: para cada objetivo sin cubrir, el adorno más barato que lo dé.
 */
function suggestMissingDecorations(
  request: SolveRequest,
  index: CatalogIndex,
  unreachable: SkillTarget[],
): { decorationId: number; quantity: number }[] {
  const out: { decorationId: number; quantity: number }[] = [];

  for (const target of unreachable) {
    const providers = index.catalog.decorations
      .filter((d) => d.kind === 'armor' && d.skills.some((s) => s.skillId === target.skillId))
      .sort((a, b) => a.slot - b.slot);

    const best = providers[0];
    if (!best) continue;

    const perDeco = best.skills.find((s) => s.skillId === target.skillId)!.level;
    const owned = request.inventory.decorations[String(best.id)] ?? 0;
    const needed = Math.ceil(target.level / perDeco) - owned;
    if (needed > 0) out.push({ decorationId: best.id, quantity: needed });
  }

  return out;
}

export type { Catalog, CatalogIndex };
