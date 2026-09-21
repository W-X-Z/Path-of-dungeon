// 6번의 습격. 각 습격은 여러 분대(squad)로 구성되고, 분대마다 출발 지연이 있습니다.
// 지연은 "도착 간격"을 만드는 장치입니다 — 이 게임에서 쿨타임 재미의 원천입니다.
//
// gate: 입구 인덱스. openGates 가 그 습격에서 열리는 입구 수를 정합니다.

export const RAIDS = [
  {
    id: 1,
    name: '척후',
    openGates: 1,
    squads: [{ gate: 0, at: 0, units: ['knight', 'knight'] }],
    teaches: '선을 방 위로 끌어다 놓으면 침입자가 그 방을 지나갑니다.',
  },
  {
    id: 2,
    name: '선발대',
    openGates: 1,
    squads: [
      { gate: 0, at: 0, units: ['rogue', 'rogue'] },
      { gate: 0, at: 6, units: ['knight', 'knight'] },
    ],
    teaches: '빠른 선발대가 긴 쿨타임의 방을 먼저 소모합니다.',
  },
  {
    id: 3,
    name: '협공',
    openGates: 2,
    squads: [
      { gate: 0, at: 0, units: ['knight', 'knight', 'knight'] },
      { gate: 1, at: 3, units: ['rogue', 'rogue', 'rogue'] },
    ],
    teaches: '두 노선이 같은 방을 쓰면 쿨타임도 함께 씁니다.',
  },
  {
    id: 4,
    name: '성전',
    openGates: 2,
    squads: [
      { gate: 0, at: 0, units: ['knight', 'priest'] },
      { gate: 1, at: 2, units: ['knight', 'knight', 'priest'] },
    ],
    teaches: '사제가 살아 있으면 지속 피해가 상쇄됩니다. 한 곳에 피해를 몰아야 합니다.',
  },
  {
    id: 5,
    name: '미끼와 본대',
    openGates: 2,
    squads: [
      { gate: 0, at: 0, units: ['rogue'] },
      { gate: 0, at: 5, units: ['knight', 'knight', 'priest'] },
      { gate: 1, at: 1, units: ['rogue', 'rogue'] },
    ],
    teaches: '미끼에 폭발을 써버리면 본대를 놓칩니다. 노선을 갈라 쿨타임을 지키세요.',
  },
  {
    id: 6,
    name: '총공세',
    openGates: 3,
    squads: [
      { gate: 0, at: 0, units: ['knight', 'knight', 'priest'] },
      { gate: 1, at: 2, units: ['rogue', 'rogue', 'rogue'] },
      { gate: 2, at: 5, units: ['knight', 'knight', 'knight', 'priest'] },
      { gate: 0, at: 11, units: ['rogue', 'knight'] },
    ],
    teaches: '세 방향을 같은 예산으로 감당해야 합니다.',
  },
];

export const CASTLE_HP = 100;
