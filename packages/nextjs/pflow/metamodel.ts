import React from "react";
import { MetaObject, Model, ModelDeclaration, ModelType, Place, Transition, Vector, newModel } from "./model";
import { Stream } from "./stream";
import { Action } from "./types";

export type MaybeNode = Place | Transition | null;
export const keyToAction: Record<string, Action> = Object.freeze({
  "1": "select",
  "2": "snapshot",
  "3": "execute",
  "4": "place",
  "5": "transition",
  "6": "arc",
  "7": "token",
  "8": "delete",
  "9": "resize",
  "0": "select",
  s: "snapshot",
  x: "execute",
  p: "place",
  t: "transition",
  a: "arc",
  k: "token",
  d: "delete",
});

interface Event {
  action: string;
  multiple: number;
}

function newStream(m: Model): Stream<Event> {
  const stream = new Stream<Event>({ model: m });
  stream.dispatcher.onFail((s: any, evt: any) => {
    // this app doesn't let the user make invalid transitions
    // so this should never happen
    console.error({ s, evt }, "onFail");
  });
  return stream;
}

// @ts-ignore
const noOp = () => {
  return "noop";
};

const initialModel = newModel({
  declaration: noOp,
  type: ModelType.petriNet,
});

interface StreamLog {
  ts: number;
  revision: number;
  action: string;
  href: string;
}

const EDITOR_HEIGHT = 625;

export class MetaModel {
  ethAccount = "null";
  importedContract = "null";
  m: Model = initialModel;
  urlLoaded: Promise<void> = Promise.resolve();
  height = EDITOR_HEIGHT;
  selectedObject: MetaObject | null = null;
  selectedId: string | null = null;
  mode: Action = "select";
  stream: Stream<Event> = newStream(initialModel);
  zippedJson = "";
  revision = 0;
  commits: Map<number, string> = new Map<number, string>();
  logs: Map<number, StreamLog> = new Map<number, StreamLog>();
  protected running = false;
  protected editing = false;
  protected onHotkeyDown: (evt: KeyboardEvent) => void;
  protected onHotkeyUp: (evt: KeyboardEvent) => void;
  protected updateHook: () => void = noOp;

  constructor() {
    this.onHotkeyUp = async evt => {
      return this.onKeyup(evt);
    };
    this.onHotkeyDown = async evt => {
      return this.onKeydown(evt);
    };
    // REVIEW: hotkeys are disabled for now
    // window.addEventListener('keyup', this.onHotkeyUp);
    // window.addEventListener('keydown', this.onHotkeyDown);

    this.m = initialModel;
    this.stream = newStream(this.m);
    this.commit({ action: "load initial model" });

    // this.urlLoaded = loadModelFromPermLink()
    //   .then(urlModel => {
    //     this.m = urlModel;
    //     this.stream = newStream(this.m);
    //     return this.commit({ action: "load from permalink" });
    //   })
    //   .catch(() => {
    //     this.m = initialModel;
    //     this.stream = newStream(this.m);
    //     return this.commit({ action: "load initial model" });
    //   });
  }

  setConnectedAccount(account: string): void {
    this.ethAccount = account;
  }

  setImportedContract(address: string): void {
    this.importedContract = address;
  }

  getContract(): string {
    if (this.importedContract === "null") {
      return "0x498ad3a8c64ccb6ffa65ee0658a3efadf6828509";
    }
    return this.importedContract;
  }

  isEditing() {
    return this.editing;
  }

  async loadJson(json: string): Promise<boolean> {
    try {
      const data = JSON.parse(json) as ModelDeclaration;
      if (data.version !== "v0") {
        console.warn("model version mismatch, expected: v0 got: " + data.version);
        data.version = "v0";
      }
      this.m = newModel({
        declaration: data,
        type: data.modelType,
      });
      // return compressBrotliEncode(json).then(zipped => {
      //   this.zippedJson = zipped;
      //   this.restartStream(false);
      //   return true;
      // });
      return Promise.resolve(true);
    } catch (e) {
      console.error(e);
      return Promise.resolve(false);
    }
  }

  clearAll(): Promise<void> {
    this.m = newModel({
      declaration: noOp,
      type: ModelType.petriNet,
    });
    this.restartStream(false);
    return this.commit({ action: "clear all" });
  }

  toJson(): string {
    const places: any[] = [];
    this.m.def.places.forEach(p => {
      const { initial, position, offset } = p;
      let capacity = p.capacity;
      if ([ModelType.elementary, ModelType.workflow].includes(this.m.def.type)) {
        capacity = 0; // use default capacity for elementary and workflow
      }
      let place = `{ "offset": ${offset}, "x": ${position.x}, "y": ${position.y} }`;
      if (initial !== 0 && capacity !== 0) {
        place = `{ "offset": ${offset}, "initial": ${initial}, "capacity": ${capacity}, "x": ${position.x}, "y": ${position.y} }`;
      } else if (initial === 0 && capacity !== 0) {
        place = `{ "offset": ${offset}, "capacity": ${capacity}, "x": ${position.x}, "y": ${position.y} }`;
      } else if (initial !== 0 && capacity === 0) {
        place = `{ "offset": ${offset}, "initial": ${initial}, "x": ${position.x}, "y": ${position.y} }`;
      }
      places.push([p.label, place]);
    });

    const transitions: any[] = [];
    this.m.def.transitions.forEach(t => {
      if (t.role.label !== "default") {
        transitions.push([t.label, `{ "role": "${t.role.label}", "x": ${t.position.x}, "y": ${t.position.y} }`]);
      } else {
        transitions.push([t.label, `{ "x": ${t.position.x}, "y": ${t.position.y} }`]);
      }
    });

    const arcs: any[] = [];
    this.m.def.arcs.forEach(a => {
      arcs.push([
        a.source?.place?.label || a.source?.transition?.label,
        a.target?.place?.label || a.target?.transition?.label,
        a.weight,
        !!a.inhibit,
      ]);
    });

    let out = `{\n  "modelType": "${this.m.def.type}",\n  "version": "v0",`;
    out += `\n  "places": {\n`;
    places.forEach(p => {
      out += `    "${p[0]}": ${p[1]},\n`;
    });
    if (places.length > 0) {
      out = out.substring(0, out.length - 2); // trim last comma
    } else {
      out = out.substring(0, out.length - 1); // trim last newline
    }
    out += `\n  },\n  "transitions": {\n`;
    transitions.forEach(t => {
      out += `    "${t[0]}": ${t[1]},\n`;
    });
    if (transitions.length > 0) {
      out = out.substring(0, out.length - 2); // trim last comma
    } else {
      out = out.substring(0, out.length - 1); // trim last newline
    }
    out += `\n  },\n  "arcs": [\n`;
    arcs.forEach(a => {
      if (a[2] === 1) {
        if (a[3] === false) {
          out += `    { "source": "${a[0]}", "target": "${a[1]}" },\n`;
        } else {
          out += `    { "source": "${a[0]}", "target": "${a[1]}", "inhibit": ${a[3]} },\n`;
        }
      } else {
        if (a[3] === false) {
          out += `    { "source": "${a[0]}", "target": "${a[1]}", "weight": ${a[2]} },\n`;
        } else {
          out += `    { "source": "${a[0]}", "target": "${a[1]}", "weight": ${a[2]}, "inhibit": ${a[3]} },\n`;
        }
      }
    });
    if (arcs.length > 0) {
      out = out.substring(0, out.length - 2); // trim last comma
    } else {
      out = out.substring(0, out.length - 1); // trim last newline
    }
    out += `\n  ]\n}`;

    return out;
  }

  toSource(): string {
    return this.toJson();
  }

  onArrow(button: "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown"): void {
    if (!this.selectedObject) {
      return;
    }
    if (this.selectedObject.metaType === "arc") {
      return;
    }
    if (this.editing) {
      return;
    }

    const increment = 10;

    switch (button) {
      case "ArrowRight":
        this.selectedObject.position.x += increment;
        break;
      case "ArrowLeft":
        this.selectedObject.position.x -= increment;
        break;
      case "ArrowUp":
        this.selectedObject.position.y -= increment;
        break;
      case "ArrowDown":
        this.selectedObject.position.y += increment;
        break;
    }
  }

  async onKeydown(evt: KeyboardEvent): Promise<void> {
    if (evt.ctrlKey || evt.metaKey) {
      switch (evt.key) {
        case "z":
        case "Z":
          this.unsetCurrentObj();
          await this.revert(this.revision - 1);
          evt.preventDefault();
          evt.stopPropagation();
          return this.menuAction("select");
        case "y":
        case "Y":
          this.unsetCurrentObj();
          await this.revert(this.revision + 1);
          evt.preventDefault();
          evt.stopPropagation();
          return this.menuAction("select");
        default:
          return;
      }
    }
    if (this.editing) {
      return;
    }
    switch (evt.key) {
      case "Delete":
      case "Backspace":
      case "Escape":
      case "Tab":
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        this.onArrow(evt.key);
        await this.commit({ action: evt.key });
    }
    evt.preventDefault();
    evt.stopPropagation();
  }

  blurEditor(): void {
    const el = document.getElementById("pflow-code-editor");
    if (el) {
      el.blur();
    }
  }

  async onKeyup(evt: KeyboardEvent): Promise<void> {
    if (this.editing) {
      if (evt.key === "Escape") {
        this.blurEditor();
      }
      return;
    }
    if (evt.metaKey || evt.ctrlKey) {
      return;
    }
    switch (evt.key) {
      case "Tab":
        await this.onTab(evt.shiftKey);
        await this.update();
        break;
      case "Escape":
        this.unsetCurrentObj();
        await this.menuAction(this.mode);
        await this.update();
        break;
      case "Delete":
        if (this.selectedObject && this.selectedObject.metaType !== "arc") {
          this.deleteObject(this.selectedObject.label);
          this.unsetCurrentObj();
          await this.commit({ action: `delete ${this.selectedId}` });
        }
        break;
      case "1": // select
      case "2": // snapshot
      case "3": // execute
      case "4": // place
      case "5": // transition
      case "6": // arc
      case "7": // token
      case "8": // delete
      case "9": // help
      case "0": // select
      case "s": // snapshot
      case "x": // execute
      case "p": // place
      case "t": // transition
      case "a": // arc
      case "k": // token
      case "d": // delete
      case "?": // help
        await this.menuAction(keyToAction[evt.key]);
        await this.update();
        break;
    }
    evt.preventDefault();
    evt.stopPropagation();
  }

  onTab(shiftKey: boolean): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }
    const all = this.allSelectableObjects();
    if (shiftKey) {
      all.reverse();
    }
    let next = all[0];
    if (!next) {
      return Promise.resolve();
    }
    if (this.selectedObject) {
      const index = all.indexOf(this.selectedObject);
      next = all[index + 1] || all[0];
    }
    if (next.metaType === "place") {
      return this.placeClick(next.label);
    }
    if (next.metaType === "transition") {
      return this.transitionClick(next.label);
    }
    return Promise.resolve();
  }

  allSelectableObjects(): MetaObject[] {
    const objects: MetaObject[] = [];
    this.m.def.places.forEach(p => objects.push(p));
    this.m.def.transitions.forEach(t => objects.push(t));
    return objects;
  }

  onUpdate(callback: () => void): void {
    const previous = this.updateHook;
    this.updateHook = () => {
      previous();
      callback();
    };
  }

  async update(): Promise<void> {
    return this.updateHook();
  }

  async commit(params: { action: string }): Promise<void> {
    if (this.running) {
      throw new Error("cannot commit while running");
    }
    const data = await this.toJson();
    this.revision += 1;
    this.zippedJson = data;
    this.commits.set(this.revision, data);
    const record = {
      ts: Date.now(),
      revision: this.revision,
      action: params.action,
      href: `?z=${data}`,
    };
    this.logs.set(this.revision, record);
    this.cullHistory(this.revision + 1);
    return this.update();
  }

  cullHistory(fromRevision: number): void {
    for (let i = fromRevision; i < this.commits.size; i++) {
      this.commits.delete(i);
      this.logs.delete(i);
    }
  }

  async revert(commit: number): Promise<void> {
    if (commit === this.revision) {
      return;
    }
    const data = this.commits.get(commit);
    if (!data) {
      return;
    }
    this.revision = commit;
    this.zippedJson = data;
    // NOTE: removed compression support
    return Promise.resolve(data).then(async (jsonData: string) => {
      await this.loadJson(jsonData);
      return this.update();
    });
  }

  getNearbyNode(x: number, y: number): MaybeNode {
    let node: MaybeNode = null;

    function isClose(a: number, b: number) {
      return Math.abs(a - b) < 24;
    }

    function isPositionClose(x1: number, y1: number, x2: number, y2: number) {
      return isClose(x1, x2) && isClose(y1, y2);
    }

    this.m.def.places.forEach(p => {
      if (isPositionClose(x, y, p.position.x, p.position.y)) {
        node = p;
      }
    });

    this.m.def.transitions.forEach(t => {
      if (isPositionClose(x, y, t.position.x, t.position.y)) {
        node = t;
      }
    });
    return node;
  }

  evtToCoords(evt: React.MouseEvent): { x: number; y: number } {
    return {
      x: evt.pageX,
      y: evt.pageY,
    };
  }

  editorClick(evt: React.MouseEvent): Promise<void> {
    let updated = false;
    const coords = this.evtToCoords(evt);
    const nearby = this.getNearbyNode(coords.x, coords.y);
    switch (this.mode) {
      case "select":
        if (!nearby) {
          this.unsetCurrentObj();
          return this.update();
        }
        break;
      case "place":
        if (!nearby) {
          updated = this.m.addPlace({ x: coords.x, y: coords.y });
        }
        break;
      case "transition":
        if (!nearby) {
          updated = this.m.addTransition({ x: coords.x, y: coords.y });
        }
        break;
    }
    if (updated) {
      return this.commit({ action: `add ${this.mode}` });
    }
    return Promise.resolve();
  }

  restartStream(running = true): void {
    this.running = running;
    this.stream = newStream(this.m);
    this.stream.restart();
    this.stream.state = this.m.initialVector();
  }

  resizeSvg(): Promise<void> {
    if (this.height !== EDITOR_HEIGHT) {
      this.height = EDITOR_HEIGHT;
    } else {
      // @ts-ignore
      this.height = window.innerHeight - 55;
    }
    return this.update();
  }

  // pflow.dev model of snapshot/execute state space
  async menuAction(action: Action): Promise<void> {
    if (action === "resize") {
      if (this.mode === "snapshot") {
        //hideCanvas();
        if (this.isRunning()) {
          this.restartStream(false);
        }
        this.mode = "select";
      }
      return this.resizeSvg();
    }
    const current = this.mode;
    const unClick = current === action;
    const isSnapshot = "snapshot" === action;
    const wasSnapshot = "snapshot" === current;
    const isExecute = "execute" === action;
    const wasExecute = "execute" === current;
    const wasDelete = "delete" === current;

    if (unClick) {
      if (wasDelete) {
        this.mode = "select";
      }
      if (wasSnapshot) {
        if (!this.running) {
          this.mode = "select";
        } else {
          this.mode = "execute";
        }
        // hideCanvas();
      }
      if (wasExecute) {
        this.mode = "select";
        this.restartStream(false);
      }
    } else {
      this.mode = action;
      if (isSnapshot) {
        //snapshotSvg(this.m, this.getState());
        //showCanvas();
        this.unsetCurrentObj();
      }
      if (wasSnapshot) {
        //hideCanvas();
        if (!isExecute) {
          this.restartStream(false);
        }
      }
      if (isExecute) {
        this.unsetCurrentObj();
        this.restartStream(true);
      }
      if (wasExecute) {
        if (!isSnapshot) {
          this.restartStream(false);
        }
      }
      if (!this.mode) {
        this.mode = "select";
      }
    }
  }

  unsetCurrentObj(): void {
    this.selectedObject = null;
  }

  getState(): Vector {
    let s = this.m.initialVector();
    if (this.isRunning()) {
      s = this.stream.state || this.m.initialVector();
    }
    return [...s];
  }

  getTokenCount(id: string): number {
    const state = this.getState();
    const n = this.getNode(id);
    if (n.metaType === "place") {
      const p = n as Place;
      return state[p.offset];
    }
    return 0;
  }

  isSelected(id: string): boolean {
    if (!this.selectedObject) {
      return false;
    }
    return this.selectedId === id;
  }

  getObj(id: string): MetaObject {
    let obj: MetaObject | undefined = this.m.def.transitions.get(id);
    if (obj) {
      return obj;
    }
    obj = this.m.def.places.get(id);
    if (obj) {
      return obj;
    }
    throw new Error("object not found: " + id);
  }

  getNode(id: string): Place | Transition {
    const obj = this.getObj(id);
    if (!obj) {
      throw new Error("Failed to select node" + id);
    }
    if (obj.metaType === "arc") {
      throw new Error("cannot select arc as node" + id);
    }
    return obj;
  }

  deleteObject(id: string): void {
    const obj = this.getObj(id);
    if (obj.metaType === "place") {
      this.deletePlace(id);
    }
    if (obj.metaType === "transition") {
      this.deleteTransition(id);
    }
  }

  deleteTransition(id: string): void {
    this.m.def.transitions.delete(id);
    this.m.def.arcs = this.m.def.arcs.filter(a => {
      return a.source?.transition?.label !== id && a.target?.transition?.label !== id;
    });
    this.m.def.arcs.forEach((a, i) => (a.offset = i));
  }

  deletePlace(id: string): void {
    const p = this.getPlace(id);
    this.m.def.places.delete(id);
    this.m.def.transitions.forEach(t => {
      delete t.delta[p.offset];
      t.delta.forEach((k, v) => {
        if (k > p.offset) {
          t.delta[k - 1] = v;
          delete t.delta[k];
        }
      });
      t.guards.delete(p.label);
    });
    this.m.def.arcs = this.m.def.arcs.filter(a => {
      return a.source?.place?.label !== id && a.target?.place?.label !== id;
    });
  }

  deleteArc(id: number): void {
    const arc = this.m.def.arcs[id];
    const source = arc.source?.place || arc.source?.transition;
    const target = arc.target?.place || arc.target?.transition;
    if (!source || !target) {
      throw new Error("arc has no source or target: " + id);
    }

    if (source.metaType === "place" && target.metaType === "transition") {
      const place = source as Place;
      const transition = target as Transition;
      transition.delta[place.offset] = 0;
      target.guards.delete(place.label);
    }
    if (source.metaType === "transition" && target.metaType === "place") {
      const place = target as Place;
      const transition = source as Transition;
      transition.delta[place.offset] = 0;
      source.guards.delete(place.label);
    }
    this.m.def.arcs.splice(arc.offset, 1);
    this.m.def.arcs.forEach((a, i) => (a.offset = i));
  }

  placeClick(id: string): Promise<void> {
    const obj = this.getObj(id);
    if (this.mode === "execute") {
      return Promise.resolve();
    }
    if (this.mode === "delete") {
      this.deletePlace(id);
      this.unsetCurrentObj();
      return this.commit({ action: `delete ${id}` });
    }
    if (this.mode === "arc" && this.selectedObject) {
      if (this.selectedObject.metaType === "transition" && obj.metaType === "place") {
        const place = obj as Place;
        const transition = this.selectedObject as Transition;
        const weight = 1;
        transition.delta[place.offset] = weight;
        // REVIEW: do all the steps just as in reindex() call
        this.m.def.arcs.push({
          metaType: "arc",
          offset: this.m.def.arcs.length,
          weight,
          source: { transition },
          target: { place },
        });
        this.unsetCurrentObj();
        return this.commit({ action: `add arc ${transition.label} -> ${place.label}` });
      }
      this.unsetCurrentObj();
      return this.update();
    }
    if (this.mode === "token") {
      const place = this.getPlace(id);
      switch (this.m.def.type) {
        case ModelType.petriNet:
          place.initial = place.initial + 1;
          return this.commit({ action: `add token ${place.label}` });
        case ModelType.workflow:
        case ModelType.elementary:
          if (place.initial === 0) {
            place.initial = 1;
          } else {
            place.initial = 0;
          }
          this.reLevelNet();
          return this.commit({ action: `toggle token ${place.label}` });
      }
    }
    this.selectedId = id;
    this.selectedObject = obj;
    return this.update();
  }

  placeAltClick(id: string): Promise<void> {
    if (this.mode === "token") {
      const place = this.getPlace(id);
      switch (this.m.def.type) {
        case ModelType.petriNet:
          if (place.initial > 0) {
            place.initial = place.initial - 1;
            return this.commit({ action: `remove token ${place.label}` });
          }
          break;
        case ModelType.workflow:
        case ModelType.elementary:
          if (place.initial === 0) {
            place.initial = 1;
          } else {
            place.initial = 0;
          }
          this.reLevelNet();
          return this.commit({ action: `toggle token ${place.label}` });
      }
    }
    return Promise.resolve();
  }

  getPlace(id: string): Place {
    const obj = this.getObj(id);
    if (obj.metaType === "place") {
      return obj;
    }
    throw new Error("not a place: " + id);
  }

  isRunning(): boolean {
    return this.running;
  }

  beginEdit(): void {
    this.editing = true;
  }

  endEdit(): void {
    this.editing = false;
  }

  testFire(action: string): { ok: boolean; inhibited: boolean } {
    const state = this.getState();
    const res = this.m.fire(state, action, 1);
    return { ok: res.ok, inhibited: !!res.inhibited };
  }

  transitionClick(id: string): Promise<void> {
    if (this.isRunning()) {
      if (this.stream.dispatch({ action: id, multiple: 1 }).ok) {
        return this.update();
      }
      return Promise.resolve();
    }
    if (this.mode === "delete") {
      this.deleteTransition(id);
      this.unsetCurrentObj();
      return this.commit({ action: `delete ${id}` });
    }
    if (this.mode === "arc" && this.selectedObject) {
      if (this.selectedObject.metaType === "place") {
        const place = this.selectedObject as Place;
        const transition = this.getTransition(id);
        transition.delta[place.offset] = -1;
        this.m.def.arcs.push({
          metaType: "arc",
          offset: this.m.def.arcs.length,
          weight: 1,
          source: { place },
          target: { transition },
        });
        this.unsetCurrentObj();
        return this.commit({ action: `add arc ${place.label} -> ${transition.label}` });
      }
      this.unsetCurrentObj();
      return this.update();
    }
    if (!this.isSelected(id)) {
      this.selectedId = id;
      this.selectedObject = this.getObj(id);
      return this.update();
    }
    return Promise.resolve();
  }

  getTransition(id: string): Transition {
    const obj = this.getObj(id);
    if (obj.metaType === "transition") {
      return obj;
    }
    throw new Error("not a transition: " + id);
  }

  getCurrentObj(): MetaObject | null {
    return this.selectedObject;
  }

  arcClick(id: number): Promise<void> {
    let updated = false;
    const arc = this.m.def.arcs[id];
    switch (this.mode) {
      case "delete":
        try {
          this.deleteArc(arc.offset);
          updated = true;
        } catch {
          console.warn(`failed to delete arc ${arc.offset}`);
        }
        break;
      case "arc":
        this.m.toggleInhibitor(arc.offset);
        updated = true;
        break;
      case "token":
        this.m.setArcWeight(arc.offset, arc.weight + 1);
        updated = true;
        break;
      default:
        return Promise.resolve();
    }
    this.unsetCurrentObj();
    if (updated) {
      return this.commit({ action: `update arc ${this.mode}` });
    }
    return Promise.resolve();
  }

  arcAltClick(id: number): Promise<void> {
    const arc = this.m.def.arcs[id];
    switch (this.mode) {
      case "token":
        if (!this.m.setArcWeight(arc.offset, arc.weight - 1)) {
          return Promise.resolve();
        }
        return this.commit({ action: `update weight arc: ${id}` });
      case "arc":
        this.m.swapArc(id);
        return this.commit({ action: `swap direction arc: ${id}` });
      default:
        return Promise.resolve();
    }
  }

  uploadFile(file: File): Promise<void> {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = e => {
        if (e.target) {
          const content = e.target.result;
          if (content) {
            return this.loadJson(content.toString()).then(ok => {
              if (ok) {
                this.commit({ action: `upload ${file.name}` }).then(() => {
                  resolve();
                });
              }
            });
          }
        }
        reject();
      };
      reader.readAsText(file);
    });
  }

  // REVIEW: this is a hack to make the model work with the workflow and elementary models
  reLevelNet(): void {
    let foundInitial = 0;
    this.m.def.places.forEach(p => {
      if (p.initial > 0) {
        if (foundInitial > 0) {
          p.initial = 0; // remove initial marking from all but first place
        } else {
          p.initial = 1;
        }
        foundInitial += 1;
      }
      if (p.capacity > 0) {
        p.capacity = 1;
      }
    });
    this.m.def.arcs.forEach(a => {
      a.weight = 1;
    });
    this.m.def.transitions.forEach(t => {
      t.delta.forEach((v, k) => {
        if (v > 0) {
          t.delta[k] = 1;
        } else if (v < 0) {
          t.delta[k] = -1;
        }
      });
      t.guards.forEach(g => {
        g.delta.forEach((v, k) => {
          if (v > 0) {
            g.delta[k] = 1;
          } else if (v < 0) {
            g.delta[k] = -1;
          }
        });
      });
    });
  }

  async setModelType(modelType: ModelType): Promise<void> {
    const old = this.m.def.type;
    if (old === modelType) {
      return;
    }
    this.m.def.type = modelType;
    switch (modelType) {
      case ModelType.petriNet:
        await this.commit({ action: `set model type to ${modelType}` });
        break;
      case ModelType.elementary:
      case ModelType.workflow:
        this.reLevelNet();
        await this.commit({ action: `set model type to ${modelType}` });
        break;
      default:
        throw new Error("unknown model type: " + modelType);
    }
  }
}
