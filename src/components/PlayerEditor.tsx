import { ARCHETYPES, AVATAR_SWATCHES, IDENTITIES } from "../data/presets";
import { sliderColor } from "../utils";
import type { PlayerBlueprint, PlayerStats } from "../types";
import { TRAIT_GROUPS, TRAIT_LABELS } from "../types";

interface PlayerEditorProps {
  player: PlayerBlueprint;
  onChange: (player: PlayerBlueprint) => void;
}

function updateTrait(traits: PlayerStats, key: keyof PlayerStats, value: number): PlayerStats {
  return {
    ...traits,
    [key]: value,
  };
}

export function PlayerEditor({ player, onChange }: PlayerEditorProps) {
  return (
    <div className="panel player-editor">
      <div className="player-editor__header">
        <div className="avatar-swatch" style={{ background: player.avatar }} />
        <div>
          <h3>{player.name || "Nouveau joueur"}</h3>
          <p>{player.archetype}</p>
        </div>
      </div>

      <div className="form-grid two-columns">
        <label>
          Nom
          <input
            value={player.name}
            onChange={(event) => onChange({ ...player, name: event.target.value })}
          />
        </label>
        <label>
          Identite
          <select
            value={player.identity}
            onChange={(event) => onChange({ ...player, identity: event.target.value })}
          >
            {IDENTITIES.map((identity) => (
              <option key={identity} value={identity}>
                {identity}
              </option>
            ))}
          </select>
        </label>
        <label>
          Archetype
          <select
            value={player.archetype}
            onChange={(event) => onChange({ ...player, archetype: event.target.value })}
          >
            {ARCHETYPES.map((archetype) => (
              <option key={archetype.name} value={archetype.name}>
                {archetype.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Avatar
          <select
            value={player.avatar}
            onChange={(event) => onChange({ ...player, avatar: event.target.value })}
          >
            {AVATAR_SWATCHES.map((avatar) => (
              <option key={avatar} value={avatar}>
                {avatar}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="trait-groups">
        {TRAIT_GROUPS.map((group) => (
          <section key={group.label} className="trait-group">
            <h4>{group.label}</h4>
            <div className="trait-grid">
              {group.keys.map((traitKey) => (
                <label key={traitKey} className="trait-slider">
                  <span>
                    {TRAIT_LABELS[traitKey]} <strong>{Math.round(player.traits[traitKey])}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={player.traits[traitKey]}
                    style={{ accentColor: sliderColor(player.traits[traitKey]) }}
                    onChange={(event) =>
                      onChange({
                        ...player,
                        traits: updateTrait(player.traits, traitKey, Number(event.target.value)),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
