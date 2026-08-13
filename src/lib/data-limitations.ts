export type DataLimitation = {
  section: "direction" | "dwell-time" | "station-join" | "station-registry";
  warning: string;
};

const limitations: Array<DataLimitation & { keywords: string[] }> = [
  {
    section: "direction",
    keywords: ["편방향", "복화", "빈 화차"],
    warning: "편방향 물량 중 복화로 실제 채울 수 있는 물량은 7%뿐입니다.",
  },
  {
    section: "dwell-time",
    keywords: ["상차", "하차", "체류", "시발", "종착"],
    warning: "시발역과 종착역의 상차·하차 시간은 시간표에 기록되지 않습니다.",
  },
  {
    section: "station-join",
    keywords: ["부산신항", "신광양항", "조차장", "시간표", "소요시간"],
    // "이 역은" 이라고 단정하면 역 이름이 없는 질문("소요시간이 얼마나 늘어나나요?")에도
    // 주입돼서 모델이 있지도 않은 역을 거절한다. 실제로 배포본에서 관측했다.
    // 어느 역이 없는지 이름을 대면 역이 언급됐을 때만 걸린다.
    warning:
      "부산신항·신광양항 같은 항만 인입선과 조차장은 시간표(계획 다이어)에 없어, 그 역이 포함된 구간은 소요시간 진단을 드릴 수 없습니다. 질문에 그런 역이 없다면 이 한계는 해당되지 않습니다.",
  },
  {
    section: "station-registry",
    keywords: ["화물역", "역 명부", "운영역"],
    warning: "화물역 명부는 2019년 기준이며 실제 운영 중인 역은 64개입니다.",
  },
];

export function findDataLimitations(query: string): DataLimitation[] {
  const normalizedQuery = query.toLowerCase();

  return limitations
    .filter(({ keywords }) =>
      keywords.some((keyword) => normalizedQuery.includes(keyword.toLowerCase())),
    )
    .map(({ section, warning }) => ({ section, warning }));
}
