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
    warning: "이 역은 시간표 데이터에 없어 소요시간 진단은 드릴 수 없습니다.",
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
