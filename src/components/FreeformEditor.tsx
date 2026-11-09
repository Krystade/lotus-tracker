import { useEffect, useReducer, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { useStore } from "../state/store";
import { useLayoutEdit } from "./layoutEdit";
import { colorForSeat, textOn } from "../layout/colors";
import { cellInfo, powerCells, roundPoly, type CellInfo, type Pt, type Rect } from "../layout/power";
import {
  BUILTIN_TEMPLATES,
  MAX_SEATS,
  buildFreeLayout,
  seatsFromLayout,
  shrinkToMarkers,
  templateSeats,
} from "../layout/freeform";
import type { FreeSeat, FreeTemplate, Rotation } from "../state/types";

/**
 * Freeform "Edit layout": drag seats, resize them (pinch, wheel, edge and
 * corner grips), turn them (twist, Shift+wheel, ⟳), remove (−) and add (+)
 * seats, with a live power-diagram preview. Confirm bakes it into the game's
 * layout and saves a template. Ported from the layout-editor prototype's
 * "Freeform + Gaps: Fill" mode. Life buttons underneath are covered, so inert.
 */

const SNAP = 8;
const GAP = 8;
const MIN_TILE = 84;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const normDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const snapQuad = (a: number) => ((((Math.round(a / 90) * 90) % 360) + 360) % 360) as Rotation;
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const padded = (o: Rect): Rect => ({ x: o.x - GAP + 1, y: o.y - GAP + 1, w: o.w + 2 * GAP - 2, h: o.h + 2 * GAP - 2 });
const polyCss = (poly: Pt[]) => "polygon(" + poly.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(",") + ")";

interface Guide {
  ax: "x" | "y";
  pos: number;
}

interface Gesture {
  multi: boolean;
  pointers: Map<number, Pt>;
  br: DOMRect;
  move: () => void;
  end: () => void;
  rebase?: () => void;
}

interface EdState {
  seats: FreeSeat[];
  history: string[];
  held: string | null;
  guides: Guide[];
  previewRot: number | null;
  wheel: boolean;
  seq: number;
  auto: Map<string, Rotation>;
  gest: Gesture | null;
  toast: string;
  toastTimer: number;
}

interface Props {
  W: number;
  H: number;
}

export function FreeformEditor({ W, H }: Props) {
  const layout = useStore((s) => s.game.layout);
  const players = useStore((s) => s.game.players);
  const templates = useStore((s) => s.freeTemplates);
  const applyFreeform = useStore((s) => s.applyFreeform);
  const saveFreeTemplate = useStore((s) => s.saveFreeTemplate);
  const deleteFreeTemplate = useStore((s) => s.deleteFreeTemplate);
  const stop = useLayoutEdit((s) => s.stop);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dims = useRef({ W, H });
  dims.current = { W, H };

  const stRef = useRef<EdState | null>(null);
  if (!stRef.current) {
    stRef.current = {
      seats: seatsFromLayout(layout),
      history: [],
      held: null,
      guides: [],
      previewRot: null,
      wheel: false,
      seq: 0,
      auto: new Map(),
      gest: null,
      toast: "",
      toastTimer: 0,
    };
  }
  const st = stRef.current;

  // ---- identity: existing players keep theirs, new seats get a free colour ----
  const byId = new Map(players.map((p) => [p.id, p]));
  const colorOf = (() => {
    const used = new Set(st.seats.filter((s) => byId.has(s.playerId)).map((s) => byId.get(s.playerId)!.color));
    const out = new Map<string, string>();
    for (const s of st.seats) {
      const p = byId.get(s.playerId);
      if (p) out.set(s.playerId, p.color);
      else {
        let k = 0;
        while (k < 6 && used.has(colorForSeat(k))) k++;
        const c = colorForSeat(k < 6 ? k : out.size);
        used.add(c);
        out.set(s.playerId, c);
      }
    }
    return out;
  })();

  // ---- helpers over unit seats, in board px ----
  const pxOf = (t: FreeSeat): Rect => ({ x: t.x * dims.current.W, y: t.y * dims.current.H, w: t.w * dims.current.W, h: t.h * dims.current.H });
  const setPx = (t: FreeSeat, r: Rect) => {
    t.x = r.x / dims.current.W;
    t.y = r.y / dims.current.H;
    t.w = r.w / dims.current.W;
    t.h = r.h / dims.current.H;
  };
  const snap = () => JSON.stringify(st.seats);
  const restore = (s: string) => {
    st.seats = JSON.parse(s);
  };
  const commit = (before: string) => {
    if (snap() !== before) st.history.push(before);
  };
  const toast = (msg: string) => {
    st.toast = msg;
    window.clearTimeout(st.toastTimer);
    st.toastTimer = window.setTimeout(() => {
      st.toast = "";
      force();
    }, 1700);
    force();
  };
  const effRot = (t: FreeSeat): number => t.rot ?? st.auto.get(t.playerId) ?? 0;
  const setRot = (t: FreeSeat, rot: number) => {
    const r = (((rot % 360) + 360) % 360) as Rotation;
    t.rot = st.auto.get(t.playerId) === r ? null : r;
  };

  function snapTargets(pid: string) {
    const { W: SW, H: SH } = dims.current;
    type C = { v: number; g: number };
    const xs: { lo: C[]; hi: C[]; mid: C[] } = { lo: [{ v: 0, g: 0 }], hi: [{ v: SW, g: SW }], mid: [{ v: SW / 2, g: SW / 2 }] };
    const ys: { lo: C[]; hi: C[]; mid: C[] } = { lo: [{ v: 0, g: 0 }], hi: [{ v: SH, g: SH }], mid: [{ v: SH / 2, g: SH / 2 }] };
    for (const t of st.seats) {
      if (t.playerId === pid) continue;
      const o = pxOf(t);
      xs.lo.push({ v: o.x, g: o.x }, { v: o.x + o.w + GAP, g: o.x + o.w + GAP / 2 });
      xs.hi.push({ v: o.x + o.w, g: o.x + o.w }, { v: o.x - GAP, g: o.x - GAP / 2 });
      ys.lo.push({ v: o.y, g: o.y }, { v: o.y + o.h + GAP, g: o.y + o.h + GAP / 2 });
      ys.hi.push({ v: o.y + o.h, g: o.y + o.h }, { v: o.y - GAP, g: o.y - GAP / 2 });
      // A seat's centre is its site, so line centres up too.
      xs.mid.push({ v: o.x + o.w / 2, g: o.x + o.w / 2 });
      ys.mid.push({ v: o.y + o.h / 2, g: o.y + o.h / 2 });
    }
    return { xs, ys };
  }
  function nearestSnap(val: number, list: { v: number; g: number }[]) {
    let best: { d: number; g: number } | null = null;
    for (const c of list) {
      const d = c.v - val;
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, g: c.g };
    }
    return best;
  }
  function snapRect(r: Rect, pid: string, kind: "move" | "edges", edges = "") {
    const { W: SW, H: SH } = dims.current;
    const { xs, ys } = snapTargets(pid);
    const guides: Guide[] = [];
    r = { ...r };
    if (kind === "move") {
      for (const ax of ["x", "y"] as const) {
        const T = ax === "x" ? xs : ys;
        const size = ax === "x" ? r.w : r.h;
        const opts = [nearestSnap(r[ax], T.lo), nearestSnap(r[ax] + size, T.hi), nearestSnap(r[ax] + size / 2, T.mid)].filter(
          (o): o is { d: number; g: number } => !!o,
        );
        if (!opts.length) continue;
        opts.sort((p, q) => Math.abs(p.d) - Math.abs(q.d));
        const pick = opts[0];
        r[ax] += pick.d;
        for (const o of opts) if (Math.abs(o.d - pick.d) < 0.6) guides.push({ ax, pos: o.g });
      }
    } else {
      let L = r.x;
      let R = r.x + r.w;
      let T = r.y;
      let B = r.y + r.h;
      const take = (val: number, list: { v: number; g: number }[], ax: "x" | "y") => {
        const s = nearestSnap(val, list);
        if (s) {
          guides.push({ ax, pos: s.g });
          return val + s.d;
        }
        return val;
      };
      if (edges.includes("l")) L = take(L, xs.lo, "x");
      if (edges.includes("r")) R = take(R, xs.hi, "x");
      if (edges.includes("t")) T = take(T, ys.lo, "y");
      if (edges.includes("b")) B = take(B, ys.hi, "y");
      if (R - L >= MIN_TILE && B - T >= MIN_TILE) r = { x: L, y: T, w: R - L, h: B - T };
    }
    r.w = Math.min(r.w, SW);
    r.h = Math.min(r.h, SH);
    r.x = clamp(r.x, 0, SW - r.w);
    r.y = clamp(r.y, 0, SH - r.h);
    return { r, guides };
  }
  /** After a drop: slide off any seat it landed on, else go back. */
  function settle(t: FreeSeat, fallback: Rect) {
    const { W: SW, H: SH } = dims.current;
    const r = pxOf(t);
    const others = st.seats.filter((o) => o !== t).map(pxOf);
    if (!others.some((o) => overlap(r, o))) return;
    const cands: Rect[] = [];
    for (const o of others)
      if (overlap(r, o))
        cands.push({ ...r, x: o.x - GAP - r.w }, { ...r, x: o.x + o.w + GAP }, { ...r, y: o.y - GAP - r.h }, { ...r, y: o.y + o.h + GAP });
    const ok = cands.filter(
      (c) => c.x >= -0.5 && c.y >= -0.5 && c.x + c.w <= SW + 0.5 && c.y + c.h <= SH + 0.5 && !others.some((o) => overlap(c, o)),
    );
    ok.sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y));
    if (ok.length) setPx(t, ok[0]);
    else {
      setPx(t, fallback);
      toast("No room there — put it back");
    }
  }

  function beginGesture(g: Gesture, e: PointerEvent) {
    g.pointers = new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]);
    g.br = rootRef.current!.getBoundingClientRect();
    st.gest = g;
    g.rebase?.();
  }
  const local = (g: Gesture, p: Pt) => ({ x: p.x - g.br.left, y: p.y - g.br.top });

  function startDrag(t: FreeSeat, e: PointerEvent) {
    const before = snap();
    const start = pxOf(t);
    let base = { rect: start, rot: effRot(t), pts: [] as Pt[] };
    let twisting = false;
    const g: Gesture = {
      multi: true,
      pointers: new Map(),
      br: new DOMRect(),
      rebase: () => {
        if (st.previewRot != null) {
          setRot(t, snapQuad(st.previewRot));
          st.previewRot = null;
        }
        twisting = false;
        base = { rect: pxOf(t), rot: effRot(t), pts: [...g.pointers.values()].map((p) => local(g, p)) };
      },
      move: () => {
        const { W: SW, H: SH } = dims.current;
        const pts = [...g.pointers.values()].map((p) => local(g, p));
        let res;
        if (pts.length === 1 || base.pts.length < 2) {
          const dx = pts[0].x - base.pts[0].x;
          const dy = pts[0].y - base.pts[0].y;
          res = snapRect({ ...base.rect, x: base.rect.x + dx, y: base.rect.y + dy }, t.playerId, "move");
        } else {
          const [p0, p1] = base.pts;
          const [q0, q1] = pts;
          const s = Math.max(0.05, dist(q0, q1)) / Math.max(1, dist(p0, p1));
          const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          const m1 = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };
          const c0 = { x: base.rect.x + base.rect.w / 2, y: base.rect.y + base.rect.h / 2 };
          const c = { x: m1.x + (c0.x - m0.x) * s, y: m1.y + (c0.y - m0.y) * s };
          const w = clamp(base.rect.w * s, MIN_TILE, SW);
          const hh = clamp(base.rect.h * s, MIN_TILE, SH);
          res = snapRect({ x: c.x - w / 2, y: c.y - hh / 2, w, h: hh }, t.playerId, "edges", "lrtb");
          const da = normDeg(
            ((Math.atan2(q1.y - q0.y, q1.x - q0.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x)) * 180) / Math.PI,
          );
          if (twisting || Math.abs(da) > 18) {
            twisting = true;
            st.previewRot = base.rot + da;
          }
        }
        setPx(t, res.r);
        st.guides = res.guides;
        st.held = t.playerId;
        force();
      },
      end: () => {
        if (st.previewRot != null) {
          setRot(t, snapQuad(st.previewRot));
          st.previewRot = null;
        }
        settle(t, start);
        st.guides = [];
        st.held = null;
        commit(before);
        force();
      },
    };
    beginGesture(g, e);
  }

  /** Drag one or more edges: "t", "r", "b", "l" or the corner "rb". */
  function startGrip(t: FreeSeat, e: PointerEvent, edges: string) {
    const before = snap();
    const start = pxOf(t);
    let base = { rect: start, p: { x: 0, y: 0 } };
    const g: Gesture = {
      multi: false,
      pointers: new Map(),
      br: new DOMRect(),
      rebase: () => {
        base = { rect: pxOf(t), p: local(g, [...g.pointers.values()][0]) };
      },
      move: () => {
        const { W: SW, H: SH } = dims.current;
        const p = local(g, [...g.pointers.values()][0]);
        const dx = p.x - base.p.x;
        const dy = p.y - base.p.y;
        let L = base.rect.x;
        let T = base.rect.y;
        let R = L + base.rect.w;
        let B = T + base.rect.h;
        if (edges.includes("l")) L = clamp(L + dx, 0, R - MIN_TILE);
        if (edges.includes("r")) R = clamp(R + dx, L + MIN_TILE, SW);
        if (edges.includes("t")) T = clamp(T + dy, 0, B - MIN_TILE);
        if (edges.includes("b")) B = clamp(B + dy, T + MIN_TILE, SH);
        const res = snapRect({ x: L, y: T, w: R - L, h: B - T }, t.playerId, "edges", edges);
        setPx(t, res.r);
        st.guides = res.guides;
        st.held = t.playerId;
        force();
      },
      end: () => {
        settle(t, start);
        st.guides = [];
        st.held = null;
        commit(before);
        force();
      },
    };
    beginGesture(g, e);
  }

  function seatDown(pid: string, e: RPointerEvent) {
    if (st.gest || e.button > 0) return;
    if ((e.target as HTMLElement).closest(".fe-badge")) return;
    const t = st.seats.find((q) => q.playerId === pid);
    if (!t) return;
    e.preventDefault();
    const grip = (e.target as HTMLElement).closest<HTMLElement>("[data-edges]");
    if (grip) startGrip(t, e.nativeEvent, grip.dataset.edges!);
    else startDrag(t, e.nativeEvent);
  }

  /** Grow or shrink a seat about its centre, never into a neighbour or off the board. */
  function resizeAbout(t: FreeSeat, f: number) {
    const { W: SW, H: SH } = dims.current;
    const r = pxOf(t);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    f = clamp(f, Math.min(1, Math.max(MIN_TILE / r.w, MIN_TILE / r.h)), Math.max(1, Math.min(SW / r.w, SH / r.h)));
    const others = st.seats.filter((o) => o !== t).map(pxOf);
    const at = (k: number): Rect => {
      const w = r.w * k;
      const hh = r.h * k;
      return { x: clamp(cx - w / 2, 0, SW - w), y: clamp(cy - hh / 2, 0, SH - hh), w, h: hh };
    };
    const clear = (c: Rect) => !others.some((o) => overlap(c, padded(o)));
    let c = at(f);
    if (f > 1 && !clear(c)) {
      let lo = 1;
      let hi = f;
      for (let i = 0; i < 14; i++) {
        const m = (lo + hi) / 2;
        if (clear(at(m))) lo = m;
        else hi = m;
      }
      c = at(lo);
    }
    setPx(t, c);
  }

  const scaledAbout = (r: Rect, k: number): Rect => {
    const kk = Math.min(1, Math.max(k, MIN_TILE / r.w, MIN_TILE / r.h));
    const w = r.w * kk;
    const hh = r.h * kk;
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - hh) / 2, w, h: hh };
  };

  /** The short side of the smallest cell's face; -1 if any cell is unusable. */
  function fillScore(units: Rect[]) {
    const { W: SW, H: SH } = dims.current;
    let worst = Infinity;
    for (const rp of powerCells(units)) {
      const c = cellInfo(rp, SW, SH);
      if (!c.ok) return -1;
      worst = Math.min(worst, c.rect.w, c.rect.h);
    }
    return worst;
  }

  /**
   * A new seat goes against a board edge at the average seat size, wherever
   * the smallest resulting cell is biggest. If there's no room, every seat
   * shrinks by the same factor first, which leaves the existing cells alone.
   */
  function fillSpot() {
    const { W: SW, H: SH } = dims.current;
    const base = st.seats.map(pxOf);
    const n = base.length || 1;
    const mw = base.reduce((s, r) => s + r.w, 0) / n || 120;
    const mh = base.reduce((s, r) => s + r.h, 0) / n || 180;
    const norm = (r: Rect) => ({ x: r.x / SW, y: r.y / SH, w: r.w / SW, h: r.h / SH });
    const perK: { score: number; rects: Rect[]; spot: Rect }[] = [];
    for (const k of [1, 0.86, 0.74, 0.64, 0.55, 0.47]) {
      const rects = base.map((r) => scaledAbout(r, k));
      const nr = scaledAbout({ x: 0, y: 0, w: mw, h: mh }, k);
      const w = nr.w;
      const hh = nr.h;
      let best: { score: number; rects: Rect[]; spot: Rect } | null = null;
      const N = 18;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        for (const c of [
          { x: 0, y: (SH - hh) * u },
          { x: SW - w, y: (SH - hh) * u },
          { x: (SW - w) * u, y: 0 },
          { x: (SW - w) * u, y: SH - hh },
        ]) {
          const r = { ...c, w, h: hh };
          if (rects.some((o) => overlap(r, padded(o)))) continue;
          const score = fillScore([...rects, r].map(norm));
          if (!best || score > best.score + 1e-6) best = { score, rects, spot: r };
        }
      }
      if (best) perK.push(best);
    }
    if (!perK.length) return null;
    const top = Math.max(...perK.map((b) => b.score));
    return perK.find((b) => b.score >= top * 0.92 - 1e-6) ?? null;
  }

  // ---- actions ----
  const addSeat = () => {
    if (st.seats.length >= MAX_SEATS) return;
    const before = snap();
    const fs = fillSpot();
    if (!fs) {
      toast("No room for another seat");
      return;
    }
    st.seats.forEach((t, i) => setPx(t, fs.rects[i]));
    const t: FreeSeat = { playerId: `new${++st.seq}`, x: 0, y: 0, w: 0, h: 0, rot: null };
    setPx(t, fs.spot);
    st.seats.push(t);
    commit(before);
    force();
  };
  const removeSeat = (pid: string) => {
    if (st.seats.length <= 1) return;
    st.history.push(snap());
    st.seats = st.seats.filter((t) => t.playerId !== pid);
    force();
  };
  const rotateSeat = (pid: string) => {
    const t = st.seats.find((q) => q.playerId === pid);
    if (!t) return;
    const before = snap();
    setRot(t, effRot(t) + 90);
    commit(before);
    force();
  };
  const undo = () => {
    const s = st.history.pop();
    if (s) {
      restore(s);
      force();
    }
  };
  const applyTemplate = (t: FreeTemplate) => {
    const before = snap();
    const next = templateSeats(t);
    const ids = st.seats.map((s) => s.playerId);
    st.seats = next.map((s, i) => ({ ...s, playerId: ids[i] ?? `new${++st.seq}` }));
    commit(before);
    toast(`Applied “${t.name}”`);
  };
  const confirm = () => {
    const raw = powerCells(st.seats);
    if (raw.some((rp) => !cellInfo(rp, W, H).ok)) {
      toast("A seat has too little room — grow it or move it");
      return;
    }
    const facings = st.seats.map((s, i) => s.rot ?? cellInfo(raw[i], W, H).auto);
    const next = buildFreeLayout(st.seats, "Freeform", facings);
    applyFreeform(
      next,
      st.seats.map((s) => (byId.has(s.playerId) ? s.playerId : null)),
    );
    saveFreeTemplate(st.seats);
    stop();
  };

  // ---- window-level pointer tracking, so re-renders never drop a gesture ----
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = st.gest;
      if (!g || !g.pointers.has(e.pointerId)) return;
      if (e.cancelable) e.preventDefault();
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g.move();
    };
    const onEnd = (e: PointerEvent) => {
      const g = st.gest;
      if (!g || !g.pointers.has(e.pointerId)) return;
      g.pointers.delete(e.pointerId);
      if (!g.pointers.size) {
        st.gest = null;
        g.end();
      } else g.rebase?.();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (st.gest && e.cancelable) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
      window.clearTimeout(st.toastTimer);
    };
  }, [st]);

  // A second finger anywhere on the board joins the gesture holding a seat;
  // mouse wheel resizes (Shift: turns) the seat under the pointer.
  const wheelRef = useRef({ pid: null as string | null, kind: "", before: "", acc: 0, rotAt: 0, timer: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDownCapture = (e: PointerEvent) => {
      const g = st.gest;
      if (g && g.multi && g.pointers.size === 1 && !g.pointers.has(e.pointerId)) {
        e.preventDefault();
        e.stopPropagation();
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        g.rebase?.();
      }
    };
    const endWheel = () => {
      const w = wheelRef.current;
      window.clearTimeout(w.timer);
      if (w.before) commit(w.before);
      w.before = "";
      w.pid = null;
      if (st.wheel) {
        st.wheel = false;
        force();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (st.gest) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]");
      const t = el && st.seats.find((q) => q.playerId === el.dataset.pid);
      if (!t) return;
      e.preventDefault();
      // Chromium on Windows turns Shift+wheel into horizontal scrolling.
      let d = e.deltaY || e.deltaX;
      if (e.deltaMode === 1) d *= 33;
      else if (e.deltaMode === 2) d *= 400;
      if (!d) return;
      const w = wheelRef.current;
      const kind = e.shiftKey ? "rot" : "size";
      const now = performance.now();
      if (w.pid !== t.playerId || w.kind !== kind) {
        endWheel();
        w.pid = t.playerId;
        w.kind = kind;
        w.before = snap();
        w.acc = 0;
      }
      if (kind === "rot") {
        w.acc += d;
        if (Math.abs(w.acc) >= 40 && now - w.rotAt > 140) {
          setRot(t, effRot(t) + (w.acc > 0 ? 90 : -90));
          w.acc = 0;
          w.rotAt = now;
        }
      } else resizeAbout(t, Math.exp(-d * 0.0012));
      st.wheel = true;
      window.clearTimeout(w.timer);
      w.timer = window.setTimeout(endWheel, 280);
      force();
    };
    root.addEventListener("pointerdown", onDownCapture, true);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("pointerdown", onDownCapture, true);
      root.removeEventListener("wheel", onWheel);
    };
    // The handlers read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // ---- render ----
  const seats = st.seats;
  const raw = W > 0 ? powerCells(seats) : [];
  const cells: CellInfo[] = raw.map((rp) => cellInfo(rp, W, H));
  seats.forEach((t, i) => st.auto.set(t.playerId, cells[i]?.auto ?? 0));
  const rects = seats.map(pxOf);
  const bad = new Set<string>();
  rects.forEach((a, i) =>
    rects.forEach((b, j) => {
      if (i < j && overlap(a, b)) {
        bad.add(seats[i].playerId);
        bad.add(seats[j].playerId);
      }
    }),
  );
  cells.forEach((c, i) => {
    if (!c.ok) bad.add(seats[i].playerId);
  });
  const live = !!st.held || st.wheel;
  const builtins = BUILTIN_TEMPLATES;

  return (
    <div className={`fe${live ? " is-live" : ""}`} ref={rootRef}>
      {seats.map((t, i) => {
        const c = cells[i];
        if (!c || c.poly.length < 3) return null;
        const xs = c.poly.map((p) => p.x);
        const ys = c.poly.map((p) => p.y);
        const bx = Math.min(...xs);
        const by = Math.min(...ys);
        const color = colorOf.get(t.playerId) ?? "#888";
        const player = byId.get(t.playerId);
        const preview = st.held === t.playerId && st.previewRot != null ? st.previewRot : null;
        const rot = preview ?? effRot(t);
        const q = snapQuad(rot);
        const fw = q % 180 ? c.rect.h : c.rect.w;
        const fh = q % 180 ? c.rect.w : c.rect.h;
        return (
          <div
            key={`c-${t.playerId}`}
            className={`fe-cell${bad.has(t.playerId) ? " is-bad" : ""}`}
            data-pid={t.playerId}
            style={
              {
                left: bx,
                top: by,
                width: Math.max(...xs) - bx,
                height: Math.max(...ys) - by,
                background: color,
                color: textOn(color),
                clipPath: polyCss(roundPoly(c.poly, 20).map((p) => ({ x: p.x - bx, y: p.y - by }))),
              } as CSSProperties
            }
            onPointerDown={(e) => seatDown(t.playerId, e)}
          >
            <div
              className="fe-face"
              style={{ left: c.rect.x - bx + c.rect.w / 2, top: c.rect.y - by + c.rect.h / 2 }}
            >
              <div
                className="fe-face__in"
                style={
                  {
                    width: fw,
                    height: fh,
                    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    "--fs": `${clamp(0.38 * Math.min(fw, fh), 22, 160)}px`,
                  } as CSSProperties
                }
              >
                <span className="fe-face__life">{player ? player.life : "new"}</span>
                <span className="fe-face__name">{player ? player.name : "New player"}</span>
              </div>
            </div>
          </div>
        );
      })}
      {seats.map((t, i) => {
        const r = rects[i];
        const color = colorOf.get(t.playerId) ?? "#888";
        const preview = st.held === t.playerId && st.previewRot != null ? st.previewRot : null;
        const face = preview != null ? ({ 0: "bottom", 90: "left", 180: "top", 270: "right" } as const)[snapQuad(preview)] : undefined;
        return (
          <div
            key={`s-${t.playerId}`}
            className={`fe-seat${st.held === t.playerId ? " is-held" : ""}${bad.has(t.playerId) ? " is-bad" : ""}`}
            data-pid={t.playerId}
            data-face={face}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, "--c": color } as CSSProperties}
            onPointerDown={(e) => seatDown(t.playerId, e)}
          >
            <span className="fe-dot" />
            {seats.length > 1 && (
              <button
                type="button"
                className="fe-badge fe-badge--del"
                aria-label={`remove ${byId.get(t.playerId)?.name ?? "new player"}`}
                onClick={() => removeSeat(t.playerId)}
              >
                −
              </button>
            )}
            <button
              type="button"
              className="fe-badge fe-badge--rot"
              aria-label="turn to face the next side"
              onClick={() => rotateSeat(t.playerId)}
            >
              ⟳
            </button>
            <div className="fe-grip" data-edges="rb" aria-label="resize from the corner" />
            {(["t", "r", "b", "l"] as const).map((s) => (
              <div key={s} className={`fe-edge fe-edge--${s}`} data-edges={s} aria-label="resize this side" />
            ))}
          </div>
        );
      })}
      {st.guides.map((g, i) => (
        <div key={i} className={`fe-guide fe-guide--${g.ax}`} style={g.ax === "x" ? { left: g.pos } : { top: g.pos }} />
      ))}
      {seats.length < MAX_SEATS && (
        <button type="button" className="fe-fab" aria-label="add player" onClick={addSeat}>
          +
        </button>
      )}
      {st.toast && (
        <div className="fe-toast" role="status">
          {st.toast}
        </div>
      )}
      <div className="fe-bar">
        <button type="button" className="fe-btn fe-btn--icon" aria-label="undo" disabled={!st.history.length} onClick={undo}>
          ↶
        </button>
        <div className="fe-chips" aria-label="Templates">
          {[...builtins, ...templates].map((t) => (
            <span key={t.id} className="fe-chip-wrap">
              <button type="button" className="fe-chip" onClick={() => applyTemplate(t)} aria-label={`template ${t.name}`}>
                <Thumb tpl={t} />
                {t.name}
              </button>
              {!builtins.includes(t) && (
                <button
                  type="button"
                  className="fe-chip__del"
                  aria-label={`delete template ${t.name}`}
                  onClick={() => deleteFreeTemplate(t.id)}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        <button type="button" className="fe-btn fe-btn--icon" aria-label="cancel edits" onClick={stop}>
          ✕
        </button>
        <button type="button" className="fe-btn fe-btn--go" aria-label="confirm layout" onClick={confirm}>
          ✓
        </button>
      </div>
    </div>
  );
}

/** A tiny picture of a template's cells. */
export function Thumb({ tpl, w = 22, h = 34 }: { tpl: FreeTemplate; w?: number; h?: number }) {
  const raw = powerCells(shrinkToMarkers(tpl.seats));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="fe-thumb">
      {raw.map((c, i) =>
        c.length >= 3 ? (
          <polygon
            key={i}
            points={c.map((p) => `${(p.x * w).toFixed(2)},${(p.y * h).toFixed(2)}`).join(" ")}
            fill={colorForSeat(i)}
            stroke="#000"
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
        ) : null,
      )}
    </svg>
  );
}
