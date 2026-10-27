# 校园资料维护

本目录只保存公开来源、维护规则和文件指纹。验证与同步在电脑上运行，不给小程序增加前台包体、云调用或定时任务。

## 1. ETA 验证

```sh
node scripts/validate_term_eta.mjs /private/data/cuhk-modeling-data.json /private/data /private/data/new-validation
```

输出目录必须全新，并位于 Git 仓库、小程序及 Sites 项目之外。报告分成两部分：

- **历史回看**：每天只用更早的完整行程重新拟合，暑假与开学期不混合；另列尊重上传时间的结果。已经看过的数据不能重新叫作独立测试。
- **冻结后验证**：保存当下模型、路线指纹、冻结时间和已知行程指纹。之后的新数据用 `--protocol /private/data/new-validation/frozen-protocol.json` 评分，先看结果，再考虑将这些新行程用于训练。更换路线后不能继续冒充同一测试。

目标是上车时间到后续 GPS 近站时间的区间用时，不是精确开门时刻，也不能直接等同所有车辆在任意时刻的 ETA。报告列平均绝对误差、逐行程均衡误差、P50/P90、提前/延后偏差、行程数和日期数。GPS 点数多不等于独立行程多。

`station-errors.md` 与 `station-errors.csv` 按“线路 + 站序”列出每一站的误差，并进一步拆成“上车站 → 目标站”。同名上下行、环线重复站不合并；无样本站保留空误差，不能当成零误差。少于 5 趟或 3 天标记“样本不足”，只是提醒而非剔除数据或可靠性承诺。正偏差表示预报到站比实测晚，负偏差表示预报早；这不是官方时刻表的早晚点。

路线距离与观测用时推算的均速超过 80 km/h 时，只加“距时冲突待核对”标记，原数据和原差值均保留；这个提醒不代表道路限速。先核对站点、方向、实际路径及定位时间，不能直接拿可疑区间缩短预测，也不能为修正预报偏晚而再加停站时间。已有到站至到站的实测用时包含起点停站，新增停站必须替换旧的停站分量，不能重复累加。

短记录和单次上车广播保留为车辆在站的时间证据，不编造两个站之间的用时。时钟时段不等于已测得繁忙程度。验证工具不修改或自动发布生产模型。

只有单次上车广播的新数据，不能单独给出独立的站间误差；后续验证需要自愿采集的完整区间，或至少两个有可靠时间的实际到站点。不要求普通乘客一直停留在小程序页面。

分站停车增量仅作离线试验：

```sh
node scripts/analyze_station_dwell.mjs /private/data/cuhk-modeling-data.json /private/data /path/to/miniprogram-1 /private/data/new-dwell-analysis
node scripts/test_station_dwell.mjs
```

复用小程序低速聚类工具核对原始定位，不能把进入 120 米站区的全部时间都当上下客停车。按线路、站序、工作日类型及时间段单列，仅当停车分量和相邻区间均有正缺口时提出小幅候选增量。结果包含所有待核对观测，输出不用于自动训练、覆盖模型或发布；现有区间已含停车，是否改变总 ETA 还需分量重估与新行程验证。

## 2. 官方来源检查

```sh
node scripts/check_official_sources.mjs
```

`official-sources.json` 包括交通处、FNO、校历、图书馆和书院入口。`reviewEveryDays` 是维护建议，不是自动定时器。

结果在 `last-source-check.json`。第一次读取、内容变化、异常格式或跳转都需要人工核对；网络失败只记为无法读取，不代表停运、结业或 PDF 已删除。`checkedAt` 只是抓取时间，不冒充通知发布日期或营业资料核实日期。

人工核对页面和文件后，可以记录当次文档指纹：

```sh
node scripts/check_official_sources.mjs --approve <source-id> --sha256 <本次报告中的指纹>
```

指纹确认不自动改动任何站点或营业资料。核对交通通知时记录站点 ID、方向、涉及线路、生效日期和结束条件；没有结束时间的指定日期活动不可无限期延续。旧网址被复用时，保留待确认标记，不沿用原来的坐标说明。

餐厅以 FNO 及负责书院的最新官方安排为准。分别记录常规、暑期、公众假期、临时关闭和资料更新日期；抓取成功不等于证明已经重开。

## 3. 三端同步

先检查，不改文件：

```sh
node scripts/sync_public_data.mjs --mini-root /path/to/miniprogram-1 --sites-root /path/to/cuhk-campus-guide
```

确认变更清单后，加 `--apply` 才会同步。它会先在临时目录生成数据并校验，再写入目标；目标文件并发改变时拒绝覆盖，写入失败会恢复之前的内容。完全相同的资料不会重写缓存版本。

`public-data-contract.json` 明确各资料的维护来源：

- 交通几何、路线方案及 ETA 代码／模型维护在网页源；临时校园通知维护在小程序源，四个共享模块按指定方向同步。
- 餐饮和设施事实维护在小程序公开数据中，生成网页 `campus_guide.js`，再导入 Sites。不要独立维护三个不同的餐厅清单。
- 地图几何要检查 WGS84 到 GCJ-02 转换、站序、时刻表与路线坐标。几何不一致时停止，不能静默覆盖实地修正。
- Sites 的界面覆盖文件单独保留，不恢复已删除的底部“路线查询”按钮。网页继续不采集轨迹；司机开关及云函数不由此工具更改。

`public-data-manifest.json` 保存共享模块指纹、公开数据指纹、记录数及坐标校验结果，不含私人数据或本机路径。

同步不是发布：GitHub 推送、Sites 发布及小程序上传仍分别确认执行。若小程序目标没有变化，不必为了维护脚本重新上传小程序。

## 检查顺序

```sh
node scripts/test_term_validation.mjs
node scripts/test_official_sources.mjs
node scripts/test_public_data_sync.mjs
node scripts/test_campus_guide.js
node scripts/test_eta_prediction.mjs
```

涉及地图、弹层或课程界面时，再做手机和桌面检查。涉及新的预测模型时，先保留旧模型、数据快照和验证报告，不依据回看分数自动替换线上模型。
