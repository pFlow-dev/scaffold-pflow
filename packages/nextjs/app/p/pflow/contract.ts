// Define the TypeScript interface
// NOTE: extracted from the contract ABI
export interface DeclarationResult {
  places: Array<{ label: string; x: bigint; y: bigint; initial: bigint; capacity: bigint }>;
  transitions: Array<{ label: string; x: bigint; y: bigint; role: bigint }>;
  arcs: Array<{
    source: string;
    target: string;
    weight: bigint;
    consume: boolean;
    produce: boolean;
    inhibit: boolean;
    read: boolean;
  }>;
}

const offsetY = 42;
const offsetX = -25;
const ScaleX = 80;
const ScaleY = 80;

// Convert the returned data to the metamodel
export function contractDeclarationToJson(contractDef: DeclarationResult): string {
  const d = {
    modelType: "petriNet",
    version: "v0",
    places: {},
    transitions: {},
    arcs: [],
  };

  if (!contractDef) {
    return JSON.stringify(d);
  }

  for (const place of contractDef.places) {
    // @ts-ignore
    d.places[place.label] = {
      x: Number(place.x) * ScaleX + offsetX,
      y: Number(place.y) * ScaleY + offsetY,
      initial: Number(place.initial),
      capacity: Number(place.capacity),
    };
  }

  for (const transition of contractDef.transitions) {
    // @ts-ignore
    d.transitions[transition.label] = {
      x: Number(transition.x) * ScaleX + offsetX,
      y: Number(transition.y) * ScaleY + offsetY,
      role: Number(transition.role),
    };
  }

  for (const arc of contractDef.arcs) {
    // @ts-ignore
    d.arcs.push({
      source: arc.source,
      target: arc.target,
      weight: Number(arc.weight),
      consume: arc.consume,
      produce: arc.produce,
      inhibit: arc.inhibit,
      read: arc.read,
    });
  }

  return JSON.stringify(d);
}
