export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  await ctx.addImage(slide, {
    path: "/Users/kangjia/Documents/辅助运营 2/artifacts/modelmate-architecture.png",
    x: 0,
    y: 0,
    w: 1280,
    h: 720,
    fit: "cover",
    alt: "Modelmate 辅助运营助手架构图",
  });

  return slide;
}
