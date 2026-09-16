export function sceneEnvironment(id: string) {
  const kind = ({ iceberg: 'ice', 'coastal-house': 'meadow', santorini: 'limestone', 'osaka-castle': 'garden' } as const)[id]
  return { kind: kind ?? 'water' }
}
