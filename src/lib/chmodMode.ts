export interface ChmodBits {
  owner: { r: boolean; w: boolean; x: boolean };
  group: { r: boolean; w: boolean; x: boolean };
  other: { r: boolean; w: boolean; x: boolean };
}

export interface ChmodPreset {
  id: string;
  label: string;
  mode: string;
  hint: string;
}

export const CHMOD_PRESETS: ChmodPreset[] = [
  {
    id: "file",
    label: "普通文件",
    mode: "644",
    hint: "自己可读写，其他人只能查看（网页、文档常用）",
  },
  {
    id: "script",
    label: "脚本 / 程序",
    mode: "755",
    hint: "自己可改，所有人可运行（shell 脚本、可执行文件）",
  },
  {
    id: "private-file",
    label: "私密文件",
    mode: "600",
    hint: "只有自己能读写（密钥、配置文件）",
  },
  {
    id: "private-dir",
    label: "私密目录",
    mode: "700",
    hint: "只有自己能进入和操作（个人目录）",
  },
  {
    id: "shared",
    label: "团队协作",
    mode: "664",
    hint: "自己与同组可改，其他人只能查看",
  },
  {
    id: "public-dir",
    label: "公共目录",
    mode: "775",
    hint: "自己与同组可改，其他人可进入查看",
  },
];

const TRIPLET = /^[0-7]{3}$/;

function digitToBits(d: number): { r: boolean; w: boolean; x: boolean } {
  return {
    r: (d & 4) !== 0,
    w: (d & 2) !== 0,
    x: (d & 1) !== 0,
  };
}

function bitsToDigit(bits: { r: boolean; w: boolean; x: boolean }): number {
  return (bits.r ? 4 : 0) + (bits.w ? 2 : 0) + (bits.x ? 1 : 0);
}

export function isValidChmodMode(value: string): boolean {
  return TRIPLET.test(value.trim());
}

export function octalToBits(octal: string): ChmodBits | null {
  const trimmed = octal.trim();
  if (!TRIPLET.test(trimmed)) return null;
  const [o, g, t] = trimmed.split("").map((ch) => Number(ch));
  return {
    owner: digitToBits(o),
    group: digitToBits(g),
    other: digitToBits(t),
  };
}

export function bitsToOctal(bits: ChmodBits): string {
  return `${bitsToDigit(bits.owner)}${bitsToDigit(bits.group)}${bitsToDigit(bits.other)}`;
}

function describeTriplet(bits: { r: boolean; w: boolean; x: boolean }): string {
  const parts: string[] = [];
  if (bits.r) parts.push("读");
  if (bits.w) parts.push("写");
  if (bits.x) parts.push("执行");
  return parts.length > 0 ? parts.join("、") : "无权限";
}

export function describeChmodMode(mode: string): string {
  const bits = octalToBits(mode);
  if (!bits) return "请从上方选择场景，或勾选细调权限";
  return `所有者：${describeTriplet(bits.owner)}；用户组：${describeTriplet(bits.group)}；其他人：${describeTriplet(bits.other)}`;
}

export function findPresetByMode(mode: string): ChmodPreset | undefined {
  return CHMOD_PRESETS.find((preset) => preset.mode === mode.trim());
}
