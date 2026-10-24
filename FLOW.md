# Heat Journey · 热量之旅 — 完整交互流程 / Full Interaction Flow

> 中文在前，English below. Screen IDs (`S1.2` etc.) are the same in the Figma plugin and the Three.js prototype.
> 所有数字都是**原型用的示例数值**，用来让故事保持前后一致，不是某个真实项目的数据。

---

# 🇨🇳 中文版

## 0. 核心叙事（一句话）

**"AI 的每一瓦电最终都会变成热。这座建筑的问题不是怎么把热扔掉，而是怎么让热有用。"**

原来的 6 步结构已经对了，问题在于：每一步只有一个画面、一个结论，没有**数字、没有用户动作、也没有冲突**。这一版给每一步加了三样东西：

1. **多个屏幕（子状态）**：每一步 3–4 个画面，不再是一张图配一段字
2. **一个微交互**：每一步用户都要亲手做点什么，到 Step 06 就不是第一次碰控件
3. **一个数字 + 一个检查点**：数字一步步累积，最后在 Step 06 用上

另外加了 **Step 00（开场钩子）** 和 **Step 07（总结）**，让故事有头有尾。

### 原文需要改的一处

> Step 02 原文：「其中相当一部分最终转化为热量」

**不准确。** GPU 消耗的电能**几乎 100%** 都会变成热（计算本身不会把能量"存"起来）。这正是整个故事最有冲击力的地方，应该改成：

> 「GPU 用掉的电，几乎全部都会变成热。1 度电进去，大约 1 度电的热出来。」

---

## 1. 统一示例场景（全程用同一组数字）

| 项目 | 数值 |
|---|---|
| IT 负载 | **1,000 kW**（25 个机架 × 每个 40 kW） |
| 单个 GPU | 约 700 W |
| 电 → 热 | ≈ **100%** |
| 液冷能带走的热 | 约 80%（其余约 20% 由空气带走） |
| 一次侧（服务器回路） | 供水 **35°C** → 回水 **45°C** |
| 热交换器 | 两侧温差约 3°C → 二次侧供水 **42°C** |
| 热泵 | 42°C 提升到 **65°C**，COP ≈ 4（1 份电 + 3 份回收热 = 4 份热） |
| 热用户 · 机器人实验室 | 地暖需要 **30–35°C** → 可以直接用 ✅ |
| 热用户 · 温室 | 需要 **40–45°C** → 刚好够用 ⚠️（冬夜需求大） |
| 热用户 · 区域供热 / 生活热水 | 需要 **60–70°C** → 必须经过热泵 🔺 |
| 没人用的热 | 屋顶干冷器排到空气里 / 先存进蓄热罐 |

## 2. 全局界面框架（所有步骤共用）

```
┌───────────────────────────────────────────────────────────────┐
│ ① 进度条  00 ─ 01 ─ 02 ─ 03 ─ 04 ─ 05 ─ 06 ─ 07              │
├──────────────────────────────────────────┬────────────────────┤
│                                          │ ② 信息面板          │
│        3D / 2D 场景（同一个模型）         │  STEP 标签          │
│        镜头推进、高亮、变暗                │  标题               │
│                                          │  正文（≤ 3 句）     │
│                                          │  微交互区           │
│                                          │  [ 上一步 ][ 下一步 ]│
├──────────────────────────────────────────┴────────────────────┤
│ ③ 温度图例 20°C ▬▬▬▬▬▬ 70°C     ④ 指标条 ⚡kW 🌡°C ♨kW 💰    │
└───────────────────────────────────────────────────────────────┘
```

| 元素 | 作用 |
|---|---|
| ① 进度条 | 可以回看已完成的步骤；第一次体验时不能跳到后面 |
| ② 信息面板 | 每屏最多 3 句话，重点数字加粗 |
| ③ 温度图例 | 一直显示。**颜色 = 温度**，是整个网站的视觉语言 |
| ④ 指标条 | 从 Step 02 开始出现，每学到一个数字就**解锁一个指标**，到 Step 06 正好全部解锁 |

### 视觉规则

| 含义 | 视觉表达 |
|---|---|
| 温度 | 颜色：蓝 20°C → 青 → 黄 → 橙 → 红 70°C |
| 流动 | 管道里的粒子；速度 = 流量 |
| 热量多少 | 线的粗细 / 发光强度 |
| 当前重点 | 亮；其余部分降到 20% 透明度 |
| 无障碍 | 颜色旁边一定有数字（"45°C"），色盲用户也能看懂 |

---

## 3. 逐屏流程

### STEP 00 · HOOK（开场）

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S0.1** 开场 | 夜景，建筑只看得到轮廓，屋顶上冒着淡淡的热气 | 点击「开始」 | **这栋楼每小时用掉 1,000 度电。这些电最后都去哪了？** |
| **S0.2** 猜一猜 | 三个选项卡片 | 用户选一个答案（选完不判对错，先记住他的答案） | 你觉得：A. 变成了"计算" B. 大部分变成了热 C. 存进了电池 |

> 用户在 S0.2 选的答案，会在 S2.3 揭晓。先让他猜一次，后面"原来如此"的感觉更强。

### STEP 01 · DISCOVER（先认识这座建筑）

**目标：** 知道这是一个系统，不是一栋普通的楼。

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S1.1** 全景 | 天亮，剖面图完整展开：地面上是数据中心，地下是设备区，右边是温室、机器人实验室，屋顶是干冷器 | 镜头缓慢环绕 | 这座建筑由四部分组成，它们靠**水管**连在一起。 |
| **S1.2** 认识区域 | 每个区域上有一个脉冲标记 | 依次点开 4 个标记（**微交互**：4 个都点完才亮"下一步"） | 计算区 · 设备区 · 热用户 · 排热 |
| **S1.3** 连起来 | 管道第一次显示出来（灰色，还没有颜色） | 无 | 这些管道是今天的主角。接下来我们看它们里面流的是什么。 |

**学到：** 计算、冷却和用热是连在一起的。
**检查点：** 「哪个区域负责把多余的热排到空气里？」→ 屋顶干冷器

### STEP 02 · UNDERSTAND（为什么 GPU 会发热？）

**目标：** 电几乎全部变成热；热必须一直被带走。

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S2.1** 走近机架 | 镜头推进到一个机架，GPU 一闪一闪 | 点击机架 | 一个机架 **40 kW**，差不多是 20 台电热水壶同时烧水。 |
| **S2.2** 让它算起来 | 机架剖面，芯片的颜色随负载变化 | **微交互：负载滑块 0–100%**，芯片温度跟着上升 | 算得越多，用电越多，热也越多。 |
| **S2.3** 揭晓答案 | 能量流向图：⚡ 40 kW 进 → ♨ ≈40 kW 出 | 显示用户在 S0.2 选的答案 | **几乎所有的电最后都变成了热。** 计算并不会把能量"存"起来。 |
| **S2.4** 不散热会怎样 | 冷却关掉，温度计数字一路往上涨 | 点击「关掉冷却」看后果（演示） | 不到一分钟芯片就会降频保护自己。所以散热是 **7×24 小时**都不能停的事。 |

**解锁指标：** ⚡ 功耗、🌡 芯片温度
**检查点：** 「40 kW 的电进去，大约多少热出来？」→ 约 40 kW

### STEP 03 · TRACE（追踪热量去了哪里）

**目标：** 热不会凭空消失，它是被水一段一段运走的。

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S3.1** 出发 | 一个发光的"热粒子"出现在 GPU 上 | 点击「追踪热量」 | 跟着这团热走一遍。 |
| **S3.2** 冷板 | 粒子进入冷板，管道变成**橙色 45°C** | 自动播放 | 贴在芯片上的冷板把热交给水。水从 35°C 变成 45°C。 |
| **S3.3** 泵 | 粒子沿着管道往下走，泵在转 | 自动播放 | 泵推着热水流到地下设备区。 |
| **S3.4** 热交换器 | 粒子到达热交换器，暂停 | 自动播放 | 到了热交换器。热在这里换到另一套水里。 |
| **S3.5** 完整回路 | 整个一次侧回路亮起来：红色去、蓝色回 | **微交互：拖动"流量"旋钮**，流量越小，回水越热 | 降温后的水回到服务器，循环重新开始。**这是一个闭环。** |

**学到：** 热量是通过冷却系统被转移的，不是消失了。
**解锁指标：** 💧 回水温度
**检查点：** 「热水离开服务器时大约多少度？」→ 45°C

### STEP 04 · RECOVER（热量如何被再次利用？）

**目标：** 理解"温度质量"——热量多不等于有用，还要看温度够不够高。

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S4.1** 进入地下 | 镜头往下推，地面变成半透明 | 无 | 地下设备区。两套水在这里"见面"，但不会混在一起。 |
| **S4.2** 热交换器剖面 | 两条水路贴在一起，热从红色那边传到蓝色那边 | hover 时显示两侧温度 | 热交换器只能把热**传过去**，不能让它**更热**。所以二次侧最多 42°C。 |
| **S4.3** ⭐ 温度够不够？ | 三个温度计：42°C 对比 35°C / 45°C / 65°C 的需求 | **微交互：把 42°C 的水分别"拖"给三个用户**，看看谁接得住 | 同样是热，**42°C 能给地暖用，却不够洗热水澡。** |
| **S4.4** 热泵 | 热泵开始工作：1 份电 + 3 份 42°C 的热 → 4 份 65°C 的热 | 点击「启动热泵」 | 热泵像"热量的电梯"，花一点电，把温度往上抬。 |

**学到：** 回收的热量不能直接用在所有地方，温度和设备条件很关键。
**解锁指标：** ♨ 可利用热量
**检查点：** 「哪个用户必须用热泵？」→ 区域供热 / 生活热水

### STEP 05 · REUSE（热量最终可以去哪里？）

**目标：** 热要和用热的"人"对上：温度要够、量要够、时间也要对得上。

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S5.1** 认识热用户 | 镜头往右移，三个用户各有一张卡片：需要的温度、需要的量、什么时候需要 | 点开卡片 | 机器人实验室 35°C · 温室 45°C · 区域供热 65°C |
| **S5.2** ⭐ 24 小时 | 时间轴：数据中心的热是一条**平线**，温室的需求在晚上冲高、中午很低 | **微交互：拖动时间轴**，场景跟着白天/黑夜变化 | 数据中心整天都在产热，温室却主要在**晚上**要热。 |
| **S5.3** 蓄热罐和排热 | 中午多出来的热进蓄热罐，罐满了再从屋顶干冷器排走 | 自动播放 | 蓄热罐把白天的热存到晚上用。实在用不掉的，才排到空气里。 |

**学到：** 系统的目标不只是排热，还要让回收的热找到合适的用途。
**解锁指标：** 💰 运行成本
**检查点：** 「为什么需要蓄热罐？」→ 产热和用热的时间对不上

### STEP 06 · OPTIMIZE（让用户自己做一次决策）

**目标：** 亲手体会"改一个参数，别的也会跟着变"。

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S6.1** 任务 | 一张任务卡 | 选一个目标：🌱 回收最多热量 / 💰 成本最低 / 🛡 GPU 最安全 | 现在你来运营这座建筑。 |
| **S6.2** 控制台 | 场景实时变化 + 3 个滑块 + 指标条的 5 个指标全部解锁 | **滑块：** GPU 负载 30–100% · 冷却供水温度 25–40°C · 季节 夏 / 春秋 / 冬 | 看看每个滑块会影响哪些数字。 |
| **S6.3** 对比方案 | 两套方案并排对比（A 是保存的方案，B 是当前方案） | 「保存为方案 A」 | 例如：供水温度调高 → 回收的热更多、热泵更省电，**但 GPU 更接近降频温度。** |

**指标之间怎么互相影响（原型用的简化模型）：**

| 你调高… | 会发生什么 |
|---|---|
| GPU 负载 | 功耗 ↑ · 产热 ↑ · 芯片温度 ↑ |
| 冷却供水温度 | 回水温度 ↑ → 可直接用的热 ↑、热泵 COP ↑ · 制冷耗电 ↓ · **芯片温度 ↑（风险）** |
| 季节变冷 | 热需求 ↑ → 回收率 ↑ · 热泵开得更多 · 排走的热 ↓ |

**学到：** 系统里各部分互相影响，优化一个指标可能会拖累另一个。

### STEP 07 · RECAP（总结）

| 屏幕 | 画面 | 交互 | 文案 |
|---|---|---|---|
| **S7.1** 你的旅程 | 回到全景，整条热量路径从 GPU 一直亮到温室 | 「重新开始」/「回到控制台」 | 三句话总结：① 电几乎都变成热 ② 热靠水来搬 ③ 温度决定了热能用在哪里 + 你在 Step 06 的方案结果 |

---

## 4. 屏幕清单（Figma 中共 25 帧）

`S0.1 S0.2 · S1.1 S1.2 S1.3 · S2.1 S2.2 S2.3 S2.4 · S3.1 S3.2 S3.3 S3.4 S3.5 · S4.1 S4.2 S4.3 S4.4 · S5.1 S5.2 S5.3 · S6.1 S6.2 S6.3 · S7.1` + 1 个 `Flow Map` 总览帧

---
---

# 🇬🇧 English Version

## 0. Core narrative (one line)

**"Every watt AI uses ends up as heat. The question isn't how to throw it away — it's how to make it useful."**

Your 6-step structure was already right. What made it feel thin: each step had **one picture and one conclusion — no numbers, no user action, no tension.** This version adds three things to every step:

1. **Multiple screens (sub-states)** — 3–4 screens per step instead of one picture with a paragraph
2. **One micro-interaction** — the user does something in every step, so Step 06 isn't the first time they touch a control
3. **One number + one checkpoint** — the numbers build up step by step and pay off in Step 06

Plus a **Step 00 (hook)** and a **Step 07 (recap)**, so the story has a clear start and end.

### One correction to the original copy

> Original Step 02: "a significant portion ends up as heat"

**This isn't accurate.** **Nearly 100%** of the electricity a GPU uses becomes heat (computing doesn't "store" the energy). That's the most striking fact in the whole story, so make it the headline:

> "Almost every bit of electricity a GPU uses turns into heat. 1 kWh in, about 1 kWh of heat out."

---

## 1. One shared scenario (the same numbers throughout)

| Item | Value |
|---|---|
| IT load | **1,000 kW** (25 racks × 40 kW) |
| One GPU | ~700 W |
| Electricity → heat | ≈ **100%** |
| Heat captured by liquid | ~80% (the other ~20% leaves through the air) |
| Primary (server) loop | supply **35°C** → return **45°C** |
| Heat exchanger | ~3°C approach → secondary supply **42°C** |
| Heat pump | lifts 42°C to **65°C**, COP ≈ 4 (1 part electricity + 3 parts recovered heat = 4 parts heat) |
| User · robot lab | underfloor heating needs **30–35°C** → can use it directly ✅ |
| User · greenhouse | needs **40–45°C** → just enough ⚠️ (demand peaks on winter nights) |
| User · district heating / hot water | needs **60–70°C** → must go through the heat pump 🔺 |
| Heat nobody needs | rejected to air by the rooftop dry cooler / stored in a thermal tank first |

## 2. Global UI frame (shared by every step)

```
┌───────────────────────────────────────────────────────────────┐
│ ① Progress  00 ─ 01 ─ 02 ─ 03 ─ 04 ─ 05 ─ 06 ─ 07             │
├──────────────────────────────────────────┬────────────────────┤
│                                          │ ② Info panel        │
│        3D / 2D scene (one model)         │  STEP tag           │
│        camera moves, highlight, dim      │  Title              │
│                                          │  Body (≤ 3 lines)   │
│                                          │  Micro-interaction  │
│                                          │  [ Back ][ Next ]   │
├──────────────────────────────────────────┴────────────────────┤
│ ③ Temp legend 20°C ▬▬▬▬▬▬ 70°C    ④ Metrics ⚡kW 🌡°C ♨kW 💰   │
└───────────────────────────────────────────────────────────────┘
```

| Element | Purpose |
|---|---|
| ① Progress | Users can go back to finished steps; on the first run they can't skip ahead |
| ② Info panel | At most 3 sentences per screen, key numbers in bold |
| ③ Temp legend | Always visible. **Color = temperature** — the site's visual language |
| ④ Metrics bar | Appears from Step 02; **each new number unlocks a metric**, and all of them are unlocked by Step 06 |

### Visual rules

| Meaning | How it's shown |
|---|---|
| Temperature | Color: blue 20°C → cyan → yellow → orange → red 70°C |
| Flow | Particles in pipes; speed = flow rate |
| Amount of heat | Line thickness / glow strength |
| Current focus | Bright; everything else fades to 20% opacity |
| Accessibility | Every color has a number next to it ("45°C"), so color-blind users can follow along |

---

## 3. Screen-by-screen

### STEP 00 · HOOK

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S0.1** Opening | Night view, building in silhouette, faint heat rising from the roof | Click "Start" | **This building uses 1,000 kWh every hour. Where does all that electricity end up?** |
| **S0.2** Guess | Three option cards | User picks an answer (we don't say if it's right yet, just remember it) | A. It becomes "computation" B. Most of it becomes heat C. It's stored in batteries |

> The answer from S0.2 is revealed in S2.3. Guessing first makes the "aha" moment hit harder.

### STEP 01 · DISCOVER

**Goal:** see that this is one system, not an ordinary building.

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S1.1** Overview | Daylight, the full cutaway opens up: data center above ground, plant room below, greenhouse and robot lab on the right, dry cooler on the roof | Slow camera orbit | This building has four parts, and they're connected by **water pipes**. |
| **S1.2** Meet the zones | A pulsing pin on each zone | Open all 4 pins (**micro-interaction**: "Next" only lights up once all 4 are opened) | Compute · Plant room · Heat users · Heat rejection |
| **S1.3** Connected | Pipes appear for the first time (gray, no color yet) | none | These pipes are the stars today. Next, let's see what's flowing inside them. |

**Learns:** compute, cooling and heat use are connected.
**Checkpoint:** "Which zone dumps extra heat into the air?" → rooftop dry cooler

### STEP 02 · UNDERSTAND

**Goal:** almost all electricity becomes heat, and that heat has to be removed all the time.

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S2.1** Approach a rack | Camera pushes in on one rack, GPUs flickering | Click the rack | One rack uses **40 kW** — about 20 electric kettles boiling at once. |
| **S2.2** Put it to work | Rack cross-section; chip color follows the load | **Micro-interaction: load slider 0–100%**, chip temperature rises with it | More computing means more electricity, which means more heat. |
| **S2.3** The reveal | Energy flow: ⚡ 40 kW in → ♨ ≈40 kW out | Show the answer the user picked in S0.2 | **Almost all of the electricity ends up as heat.** Computing doesn't "store" energy. |
| **S2.4** Without cooling | Cooling switches off; the temperature reading keeps climbing | Click "Turn off cooling" to see what happens (demo) | In under a minute the chip slows itself down to stay safe. That's why cooling can **never stop, 24/7**. |

**Unlocks:** ⚡ power, 🌡 chip temp
**Checkpoint:** "40 kW of electricity goes in. About how much heat comes out?" → ~40 kW

### STEP 03 · TRACE

**Goal:** heat doesn't disappear — water carries it away, one stage at a time.

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S3.1** Departure | A glowing "heat packet" appears on the GPU | Click "Trace the heat" | Let's follow this bit of heat. |
| **S3.2** Cold plate | Packet enters the cold plate, pipe turns **orange 45°C** | Auto-play | The cold plate on the chip passes heat to the water, which goes from 35°C to 45°C. |
| **S3.3** Pump | Packet travels down the pipe, the pump spins | Auto-play | The pump pushes the hot water down to the plant room. |
| **S3.4** Heat exchanger | Packet reaches the heat exchanger and pauses | Auto-play | This is the heat exchanger. Here the heat moves into a second water loop. |
| **S3.5** Full loop | The whole primary loop lights up: red going out, blue coming back | **Micro-interaction: drag the "flow" dial** — lower flow means hotter return water | The cooled water goes back to the servers and the cycle starts again. **It's a closed loop.** |

**Learns:** heat is moved by the cooling system; it doesn't vanish.
**Unlocks:** 💧 return temp
**Checkpoint:** "About how hot is the water when it leaves the servers?" → 45°C

### STEP 04 · RECOVER

**Goal:** understand "heat quality" — having lots of heat doesn't make it useful; it also has to be hot enough.

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S4.1** Go underground | Camera moves down, the ground turns see-through | none | The plant room. Two water loops meet here but never mix. |
| **S4.2** Heat exchanger cutaway | Two water paths side by side, heat crossing from the red one to the blue one | Hover to see both temperatures | A heat exchanger can only **pass heat along**, not make it **hotter**. So the secondary side tops out at 42°C. |
| **S4.3** ⭐ Is it hot enough? | Three thermometers: 42°C against needs of 35°C / 45°C / 65°C | **Micro-interaction: "drag" the 42°C water to each user** to see who can use it | It's the same heat, but **42°C can run underfloor heating and still can't give you a hot shower.** |
| **S4.4** Heat pump | Heat pump runs: 1 part electricity + 3 parts 42°C heat → 4 parts 65°C heat | Click "Start heat pump" | A heat pump is like an "elevator for heat" — it spends a little electricity to raise the temperature. |

**Learns:** recovered heat can't go straight into every use; temperature and equipment matter.
**Unlocks:** ♨ usable heat
**Checkpoint:** "Which user needs the heat pump?" → district heating / hot water

### STEP 05 · REUSE

**Goal:** heat has to match the people who use it — hot enough, enough of it, and at the right time.

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S5.1** Meet the heat users | Camera pans right; each of the three users has a card: temperature needed, amount needed, when it's needed | Open the cards | Robot lab 35°C · Greenhouse 45°C · District heating 65°C |
| **S5.2** ⭐ 24 hours | Timeline: the data center's heat is a **flat line**, while greenhouse demand peaks at night and is low at noon | **Micro-interaction: drag the timeline** — the scene shifts between day and night | The data center makes heat all day, but the greenhouse mostly needs it **at night**. |
| **S5.3** Storage and rejection | Extra heat at noon fills a storage tank; once it's full, the rooftop dry cooler gets rid of the rest | Auto-play | The tank saves daytime heat for the night. Only heat that truly can't be used goes into the air. |

**Learns:** the goal isn't only to get rid of heat — it's to find a good use for the heat you recover.
**Unlocks:** 💰 running cost
**Checkpoint:** "Why do we need a storage tank?" → heat is produced and used at different times

### STEP 06 · OPTIMIZE

**Goal:** feel first-hand that changing one setting changes the others too.

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S6.1** Mission | A mission card | Pick a goal: 🌱 recover the most heat / 💰 lowest cost / 🛡 safest GPUs | Now you run the building. |
| **S6.2** Console | Live scene + 3 sliders + all 5 metrics unlocked | **Sliders:** GPU load 30–100% · coolant supply temp 25–40°C · season summer / spring-autumn / winter | Watch which numbers each slider moves. |
| **S6.3** Compare | Two plans side by side (A = the saved plan, B = the current one) | "Save as plan A" | Example: raise the supply temp → more heat recovered and a cheaper-to-run heat pump, **but the GPUs get closer to throttling.** |

**How the metrics affect each other (simplified prototype model):**

| You raise… | What happens |
|---|---|
| GPU load | power ↑ · heat ↑ · chip temp ↑ |
| Coolant supply temp | return temp ↑ → more directly usable heat, heat pump COP ↑ · cooling power ↓ · **chip temp ↑ (risk)** |
| Colder season | heat demand ↑ → recovery % ↑ · heat pump runs more · rejected heat ↓ |

**Learns:** the parts of the system affect each other, so improving one metric can make another worse.

### STEP 07 · RECAP

| Screen | Visual | Interaction | Copy |
|---|---|---|---|
| **S7.1** Your journey | Back to the overview, with the whole heat path lit from the GPU to the greenhouse | "Restart" / "Back to console" | Three takeaways: ① almost all electricity becomes heat ② water carries the heat ③ temperature decides where heat can be used — plus the result of the user's Step 06 plan |

---

## 4. Screen inventory (25 frames in Figma)

`S0.1 S0.2 · S1.1 S1.2 S1.3 · S2.1 S2.2 S2.3 S2.4 · S3.1 S3.2 S3.3 S3.4 S3.5 · S4.1 S4.2 S4.3 S4.4 · S5.1 S5.2 S5.3 · S6.1 S6.2 S6.3 · S7.1` + 1 `Flow Map` overview frame
