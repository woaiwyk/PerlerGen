import React, { useState } from 'react';
import { ironPresets, IronPresetKey } from '../config/ironPresets';

interface IronGuideProps {
  ironMethod: string;
}

interface GuideStep {
  icon: string;
  text: string;
}

// 每种烫法的操作指南步骤
const IRON_GUIDES: Record<IronPresetKey, GuideStep[]> = {
  lightIron: [
    { icon: '🧵', text: '垫一层棉布' },
    { icon: '🔥', text: '熨斗调至中低温（尼龙档）' },
    { icon: '⏱️', text: '轻压 10-15 秒，看到豆子微微融合即停' },
    { icon: '🕳️', text: '保留孔洞，冷却后再揭纸' },
  ],
  fullIron: [
    { icon: '🚫', text: '不垫布' },
    { icon: '🔥', text: '熨斗中高温（丝档）' },
    { icon: '💪', text: '用力按压 20-25 秒，直到表面完全光滑无孔' },
    { icon: '🧊', text: '趁热压平，冷却定型' },
  ],
  towelIron: [
    { icon: '🧻', text: '垫两层毛巾' },
    { icon: '🔥', text: '熨斗中温' },
    { icon: '⏱️', text: '轻压 15-20 秒，表面呈毛绒质感' },
    { icon: '⚠️', text: '注意不要压死孔洞' },
  ],
  glitterIron: [
    { icon: '✨', text: '在拼豆上铺一层格利特闪粉膜' },
    { icon: '🧵', text: '再垫布，中低温轻烫 10 秒' },
    { icon: '🌟', text: '让闪粉转印到豆子上' },
  ],
  segmentIron: [
    { icon: '🔲', text: '按 29×29 分板，每块单独满烫' },
    { icon: '🧊', text: '冷却后用美纹纸从背面拼接' },
    { icon: '🔗', text: '再整体加固一次' },
  ],
};

export const IronGuide: React.FC<IronGuideProps> = ({ ironMethod }) => {
  const [expanded, setExpanded] = useState(false);

  const preset = (ironPresets as Record<string, any>)[ironMethod] || ironPresets.lightIron;
  const steps = IRON_GUIDES[(ironMethod as IronPresetKey)] || IRON_GUIDES.lightIron;

  return (
    <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5E1A4] shadow-sm overflow-hidden">
      {/* 头部：可点击展开/收起 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#FFF3CC] transition-colors text-left"
      >
        <span className="flex items-center gap-2 font-bold text-[#8B6D1F] text-sm">
          <span>📖</span>
          <span>{preset.label} · 烫法指南</span>
        </span>
        <span className="text-[#8B6D1F] text-lg leading-none transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>

      {/* 内容：展开时显示 */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          <ol className="flex flex-col gap-1.5">
            {steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-[#5C4A12]">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F5E1A4] text-[#8B6D1F] flex items-center justify-center text-xs font-bold mt-0.5">
                  {idx + 1}
                </span>
                <span className="flex items-center gap-1.5 leading-snug">
                  <span>{step.icon}</span>
                  <span>{step.text}</span>
                </span>
              </li>
            ))}
          </ol>

          {/* 安全提示 */}
          <div className="mt-2 px-3 py-2 rounded-lg bg-[#FFECB3] border border-[#F5D97A] text-xs text-[#7A5C12] leading-relaxed">
            ⚠️ 请在通风处操作，儿童需家长陪同。使用 PE 材质拼豆，避免 ABS 劣质豆。
          </div>
        </div>
      )}
    </div>
  );
};
