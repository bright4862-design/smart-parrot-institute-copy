import NPCActor from './NPCActor';
import { resolveNPCPerformanceProfile, selectAirportZoneActors } from './npcSystem';

export default function AirportPopulation({ decorationDensity = 'balanced', mobileRenderer = false, playerPosition }) {
  const profile = resolveNPCPerformanceProfile(decorationDensity, mobileRenderer);
  const actors = selectAirportZoneActors(profile);

  return (
    <group>
      {actors.map((actor) => (
        <NPCActor
          key={actor.id}
          actor={actor}
          profile={profile}
          playerPosition={playerPosition}
        />
      ))}
    </group>
  );
}
