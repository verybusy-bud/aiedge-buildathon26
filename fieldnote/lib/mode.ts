// A complete browser simulation is the default. Live services require an explicit opt-in.
export const simulation = process.env.NEXT_PUBLIC_SIMULATION_MODE !== 'false';
