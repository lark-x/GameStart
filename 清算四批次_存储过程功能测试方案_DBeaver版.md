# 清算四批次存储过程功能测试方案（DBeaver 版）

## 1. DBeaver 使用说明

使用 DBeaver 没有问题，但 SQL*Plus 的 `DEFINE`、`VARIABLE`、`PRINT`、`SPOOL` 不适合直接在普通 DBeaver SQL 编辑器中执行。本文已统一改为：

- 使用 `@set` 定义 DBeaver 脚本变量。
- 使用 `${变量名}` 进行文本替换。
- 使用匿名 PL/SQL 块声明 OUT 参数。
- 使用 `DBMS_OUTPUT.PUT_LINE` 输出 `o_code/o_note`。
- 查询型过程使用 `DBMS_SQL.RETURN_RESULT` 返回 `SYS_REFCURSOR`。

DBeaver 官方文档说明，SQL 编辑器支持 `@set`、`${var}`、`:parameter`，整段脚本可使用 `Alt+X` 执行；需要 SQL*Plus 原生能力时，可使用 `Alt+N` 原生脚本执行，但本地需配置 Oracle 客户端。参考：[DBeaver SQL execution](https://dbeaver.com/docs/dbeaver/SQL-Execution/)、[DBeaver client-side scripting](https://dbeaver.com/docs/dbeaver/Client-Side-Scripting/)。

### 1.1 推荐执行方式

1. 打开 DBeaver 的 Oracle 连接和 SQL 编辑器。
2. 在 `Window → Preferences → Editors → SQL Editor → SQL Processing` 中确认已启用 SQL 参数/变量；如果 DDL 或 PL/SQL 块中的变量没有替换，同时启用 DDL/代码块参数处理选项。
3. 打开 `DBMS Output` 面板，并为当前连接启用输出。
4. 先单独执行参数签名查询。
5. 修改每个章节开头的 `@set` 测试变量，并先执行这些 `@set` 行，或选中整个章节使用 `Alt+X` 执行。
6. 生成型过程执行前先运行备份 SQL。
7. 选中一个完整的 `DECLARE ... END;` 块执行，不要只执行光标所在的内部语句。
8. 普通查询逐条执行，或选中本章节使用 `Alt+X` 执行脚本。
9. DBeaver 默认可能自动提交；生成型过程测试前应检查连接工具栏中的 Auto-commit 状态。

### 1.2 游标兼容说明

本文查询型过程使用：

```sql
DBMS_SQL.RETURN_RESULT(v_cursor);
```

该方式要求数据库和驱动支持隐式结果集。如果数据库为 Oracle 11g 或 DBeaver 未展示结果集，可使用以下任一方式：

1. 在 Database Navigator 中找到对应过程，右键选择执行，在参数窗口查看 OUT 游标。
2. 使用 DBeaver 的 `Alt+N` 原生脚本执行，通过已安装的 SQL*Plus 执行旧式 `VARIABLE/PRINT` 脚本。

## 2. 公共测试要求

### 2.1 环境要求

- 生成型过程只能在独立 SIT/UAT 环境执行。
- 新旧实现必须读取同一时点的 Oracle、清算、托管、聚源、TA、PPOS 数据。
- 新旧实现写同一目标表时必须串行执行。
- 备份数据恢复并核对完成前，不得删除测试备份表。
- 测试用备份表名后缀必须保持唯一，防止覆盖他人测试数据。

### 2.2 统一对象状态检查

```sql
SELECT p.owner,
       p.object_name AS package_name,
       p.procedure_name,
       o.status
  FROM all_procedures p
  JOIN all_objects o
    ON o.owner = p.owner
   AND o.object_name = p.object_name
   AND o.object_type = 'PACKAGE'
 WHERE (UPPER(p.object_name), UPPER(p.procedure_name)) IN (
       ('PKG_CRM_ZQZYSHG', 'PRO_GEN_PRODUCT_REL_DATA'),
       ('PKG_CRM_JCJDBB', 'PRO_QUERY_ZQZY_FBSM_HZ_DATA'),
       ('PKG_CRM_JCJDBB', 'PRO_QUERY_ZQZY_DATA'),
       ('PKG_CRM_JCJDBB', 'PRO_QUERY_ZQZYMX_DATA'),
       ('PKG_TG_ZQZYSHG', 'PRO_GEN_REPORT_DATA_RZYE_ALL'),
       ('PKG_TG_ZQZYSHG', 'PRO_GEN_REPORT_DATA_JD_ALL'),
       ('PKG_INS_WSQ_HKZL', 'PRO_GEN_TAZL_DATA'))
 ORDER BY p.owner, p.object_name, p.procedure_name;
```

7 个过程均应为 `VALID`。

---

## 3. `pkg_crm_zqzyshg.pro_gen_product_rel_data`

### 3.1 功能分析

该过程按年份、月份生成：

1. 质押式回购余额大于 5,000 万的产品。
2. 符合条件且未重复的协议回购产品。
3. 产品持有的债券、类别和市场信息。
4. 月末前还本后的债券面值数量。
5. 沪深市场未到期回购交易。

附件中的写表对象为：

- `t_crm_zqzyshg_prod_bak20260710`
- `t_crm_zqzyshg_prod_zq_20260710`
- `t_crm_zqzyshg_hgjy_20260710`

### 3.2 主要风险

- 删除和写入使用带日期后缀的表，后续查询却读取无后缀正式表，需先确认真实代码对象。
- 产品债券查询和面值更新没有明确限制 `cp_type='2'`。
- 回购扣减使用 `vTemp >= 0`，余额恰好为 0 时可能多取一笔。
- 最后一笔交易超过剩余余额时仍可能整笔写入。
- 过程是否内部提交不明确，中途失败可能留下空表或半成品。

### 3.3 参数和测试变量

```sql
@set UT_YEAR = 2026
@set UT_MONTH = 07
@set UT_SUFFIX = 260806

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name) = 'PKG_CRM_ZQZYSHG'
   AND UPPER(object_name) = 'PRO_GEN_PRODUCT_REL_DATA'
 ORDER BY sequence;
```

### 3.4 测试数据发现 SQL

```sql
-- 5000 万阈值上下样本
SELECT t.vc_cpdm, SUM(t.en_sz) AS wdq_ye
  FROM vjk_wbfk_gzb@linktohstggz t
 WHERE t.d_ywrq = LAST_DAY(TO_DATE('${UT_YEAR}-${UT_MONTH}-01','YYYY-MM-DD'))
   AND t.vc_kmdm IN ('22020101','22020201')
 GROUP BY t.vc_cpdm
HAVING SUM(t.en_sz) BETWEEN 49999999 AND 50000001
 ORDER BY wdq_ye;

-- 同时满足质押式和协议回购的产品
SELECT vc_cpdm
  FROM vjk_wbfk_gzb@linktohstggz
 WHERE d_ywrq = LAST_DAY(TO_DATE('${UT_YEAR}-${UT_MONTH}-01','YYYY-MM-DD'))
   AND vc_kmdm IN ('22020101','22020201','22020104','22020204')
 GROUP BY vc_cpdm
HAVING SUM(CASE WHEN vc_kmdm IN ('22020101','22020201') THEN en_sz ELSE 0 END) > 50000000
   AND SUM(CASE WHEN vc_kmdm IN ('22020104','22020204') THEN en_sz ELSE 0 END) > 0;

-- 月末前存在还本记录的持仓
SELECT g.l_ztbh, g.l_zqnm, g.l_sl, z.en_mgmz,
       (SELECT MAX(h.d_hbrq)
          FROM tzqhbsz@linktohstggz h
         WHERE h.l_zqnm = g.l_zqnm
           AND h.d_hbrq <= LAST_DAY(TO_DATE('${UT_YEAR}-${UT_MONTH}-01','YYYY-MM-DD'))) latest_hbrq
  FROM ttmp_h_gzb@linktohstggz g
  JOIN tzqxx@linktohstggz z ON z.l_zqnm = g.l_zqnm
 WHERE g.d_ywrq = LAST_DAY(TO_DATE('${UT_YEAR}-${UT_MONTH}-01','YYYY-MM-DD'))
   AND (g.vc_kmdm LIKE '1103%' OR g.vc_kmdm LIKE '1104%')
   AND g.l_leaf = 1
   AND g.en_dwcb <> 0
   AND ROWNUM <= 20;
```

### 3.5 备份和调用 SQL

以下按附件中的带后缀表编写。若开发确认应使用正式表，必须整体替换表名。

```sql
CREATE TABLE ut_bak_prod_${UT_SUFFIX} AS
SELECT * FROM t_crm_zqzyshg_prod_bak20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2';

CREATE TABLE ut_bak_pzq_${UT_SUFFIX} AS
SELECT * FROM t_crm_zqzyshg_prod_zq_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2';

CREATE TABLE ut_bak_hgjy_${UT_SUFFIX} AS
SELECT * FROM t_crm_zqzyshg_hgjy_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2';
```

```sql
DECLARE
  v_code VARCHAR2(20);
  v_note VARCHAR2(4000);
BEGIN
  pkg_crm_zqzyshg.pro_gen_product_rel_data(
      '${UT_YEAR}', '${UT_MONTH}', v_code, v_note);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
END;
```

如果 `ALL_ARGUMENTS` 显示年月为数字，应使用 `TO_NUMBER('${UT_YEAR}')` 和 `TO_NUMBER('${UT_MONTH}')`。

### 3.6 功能用例

| 编号 | 场景 | 预期 |
|---|---|---|
| PR-01 | 质押式余额大于 5000 万 | 产品进入结果 |
| PR-02 | 余额等于或小于 5000 万 | 产品不进入结果 |
| PR-03 | 协议回购余额大于 0 且结算方式为 1 | 产品进入结果 |
| PR-04 | 同时满足两类回购 | 产品只出现一次 |
| PR-05 | 债券类别 1/24/5/7 及其他值 | 正确映射利率债/信用债 |
| PR-06 | 市场 1/2/3 | 正确映射三个市场 |
| PR-07 | 月末前多次还本 | 使用最近一次剩余本金 |
| PR-08 | 到期日等于月末 | 不属于未到期回购 |
| PR-09 | 扣减后恰好为 0 | 不多写下一笔 |
| PR-10 | 相同年月重跑 | 结果内容和行数不变 |
| PR-11 | 中途远端查询异常 | 不留下已删除或部分写入状态 |

### 3.7 校验 SQL

```sql
-- 产品重复
SELECT year, month, prod_code, cp_type, COUNT(*) cnt
  FROM t_crm_zqzyshg_prod_bak20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2'
 GROUP BY year, month, prod_code, cp_type
HAVING COUNT(*) > 1;

-- 债券重复
SELECT year, month, prod_code, zqnm, cp_type, COUNT(*) cnt
  FROM t_crm_zqzyshg_prod_zq_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2'
 GROUP BY year, month, prod_code, zqnm, cp_type
HAVING COUNT(*) > 1;

-- 非法映射和面值数量
SELECT prod_code, zqnm, zqlb, market, sl, mz_sl
  FROM t_crm_zqzyshg_prod_zq_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2'
   AND (zqlb NOT IN ('利率债','信用债')
        OR market NOT IN ('上海','深圳','国内银行间')
        OR mz_sl IS NULL OR mz_sl < 0);

-- 回购日期和市场范围
SELECT *
  FROM t_crm_zqzyshg_hgjy_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2'
   AND (sclb NOT IN (1,2)
        OR ywlb <> '1301'
        OR cjrq > LAST_DAY(TO_DATE('${UT_YEAR}-${UT_MONTH}-01','YYYY-MM-DD'))
        OR dqrq <= LAST_DAY(TO_DATE('${UT_YEAR}-${UT_MONTH}-01','YYYY-MM-DD')));
```

上述异常查询应返回 0 行。

### 3.8 恢复 SQL

```sql
DELETE FROM t_crm_zqzyshg_prod_bak20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2';
INSERT INTO t_crm_zqzyshg_prod_bak20260710 SELECT * FROM ut_bak_prod_${UT_SUFFIX};

DELETE FROM t_crm_zqzyshg_prod_zq_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2';
INSERT INTO t_crm_zqzyshg_prod_zq_20260710 SELECT * FROM ut_bak_pzq_${UT_SUFFIX};

DELETE FROM t_crm_zqzyshg_hgjy_20260710
 WHERE year='${UT_YEAR}' AND month='${UT_MONTH}' AND cp_type='2';
INSERT INTO t_crm_zqzyshg_hgjy_20260710 SELECT * FROM ut_bak_hgjy_${UT_SUFFIX};
COMMIT;
```

---

## 4. `pkg_crm_jcjdbb.pro_query_zqzy_fbsm_hz_data`

### 4.1 功能分析

输入结束日期，返回一行汇总数据：正回购未到期余额、非标私募托管规模、基金托管总规模、非标占比、非标规模日变动比例、私募证券投资托管规模。

```text
非标占比 = 当日非标规模 / 当日基金托管总规模 × 100%
非标变动比例 = (当日非标规模 - 上一交易日非标规模)
               / 上一交易日非标规模 × 100%
```

风险包括上一交易日计算错误、分母为 0、Oracle 与 Doris 百分比格式差异，以及 DBLINK/Catalog 数据时点不一致。

### 4.2 参数和调用 SQL

```sql
@set UT_YWRQ = 2026-07-10

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name)='PKG_CRM_JCJDBB'
   AND UPPER(object_name)='PRO_QUERY_ZQZY_FBSM_HZ_DATA'
 ORDER BY sequence;
```

```sql
DECLARE
  v_code   VARCHAR2(20);
  v_note   VARCHAR2(4000);
  v_cursor SYS_REFCURSOR;
BEGIN
  pkg_crm_jcjdbb.pro_query_zqzy_fbsm_hz_data(
      '${UT_YWRQ}', v_code, v_note, v_cursor);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
  DBMS_SQL.RETURN_RESULT(v_cursor);
END;
```

日期入参如为 `DATE`，改为 `TO_DATE('${UT_YWRQ}','YYYY-MM-DD')`。

### 4.3 功能用例

| 编号 | 场景 | 预期 |
|---|---|---|
| HZ-01 | 五类基础数据均存在 | 成功且只返回 1 行 |
| HZ-02 | 周一或节后首日 | 取实际上一交易日 |
| HZ-03 | 无符合条件产品 | 金额按约定为 0 或 NULL |
| HZ-04 | 当日基金总规模为 0 | 不出现未处理除零异常 |
| HZ-05 | 上一交易日非标规模为 0 | 不出现未处理除零异常 |
| HZ-06 | 清盘、非运行、非人民币数据 | 不进入统计 |
| HZ-07 | 新旧实现同一快照 | 数值和格式符合约定 |

### 4.4 新旧结果对比

在 DBeaver 结果集上右键导出 CSV。旧过程和新接口结果统一字段后，装载到 `ut_old_fbsm_hz`、`ut_new_fbsm_hz`：

```sql
SELECT biz_date, rzye_hz, jjtggm_hz, jjtgywgm,
       fbsm_ratio, day_change_ratio, smzq_scale
  FROM ut_old_fbsm_hz
MINUS
SELECT biz_date, rzye_hz, jjtggm_hz, jjtgywgm,
       fbsm_ratio, day_change_ratio, smzq_scale
  FROM ut_new_fbsm_hz;

SELECT biz_date, rzye_hz, jjtggm_hz, jjtgywgm,
       fbsm_ratio, day_change_ratio, smzq_scale
  FROM ut_new_fbsm_hz
MINUS
SELECT biz_date, rzye_hz, jjtggm_hz, jjtgywgm,
       fbsm_ratio, day_change_ratio, smzq_scale
  FROM ut_old_fbsm_hz;
```

金额容差建议为 0.01 元，比例去掉 `%` 后容差为 0.0001 个百分点。过程只读，无恢复步骤。

---

## 5. `pkg_crm_jcjdbb.pro_query_zqzy_data`

### 5.1 功能分析

输入结束日期，计算产品的月度经济资本并按承揽单位汇总。

```text
普通机构承揽比例 = trans_income_rate / 100
机构 385580 承揽比例 = retain_amt_percn_yda
产品月度经济资本 = 未到期融资余额 × 承揽比例 × 0.01% / 12
承揽单位经济资本 = 同单位产品经济资本之和
```

未到期条件为 `成交日 <= 结束日 AND 到期日 > 结束日`，仅处理业务类型 1301、市场 1/2、运行且未清盘产品。

### 5.2 参数和调用 SQL

```sql
@set UT_YWRQ = 2026-07-10

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name)='PKG_CRM_JCJDBB'
   AND UPPER(object_name)='PRO_QUERY_ZQZY_DATA'
 ORDER BY sequence;
```

```sql
DECLARE
  v_code   VARCHAR2(20);
  v_note   VARCHAR2(4000);
  v_cursor SYS_REFCURSOR;
BEGIN
  pkg_crm_jcjdbb.pro_query_zqzy_data(
      '${UT_YWRQ}', v_code, v_note, v_cursor);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
  DBMS_SQL.RETURN_RESULT(v_cursor);
END;
```

### 5.3 样本和功能用例

```sql
-- 普通机构与特殊机构样本
SELECT p.prod_code, o.org_id,
       NVL(o.department_name,o.yyb_name) org_name,
       d.trans_income_rate
  FROM mv_crm_prod_info p
  JOIN t_crm_product_clqk c ON c.prod_id=p.prod_id
  JOIN t_crm_product_clqk_det d ON d.clqk_id=c.clqk_id
  JOIN t_crm_org_info o ON o.org_id=d.clorg_id
 WHERE o.org_id='385580' OR ROWNUM <= 20;

SELECT prod_code, year, mth, rela_type, retain_amt_percn_yda
  FROM t_crm_product_byl
 WHERE year || LPAD(mth,2,'0') = SUBSTR(REPLACE('${UT_YWRQ}','-',''),1,6)
   AND rela_type='1';
```

| 编号 | 场景 | 预期 |
|---|---|---|
| ZQZY-01 | 普通机构比例 100%/50%/0% | 使用通用收入分配比例 |
| ZQZY-02 | 特殊机构 385580 | 使用当月收入保留比例 |
| ZQZY-03 | 同产品多个承揽单位 | 分别拆分并汇总 |
| ZQZY-04 | 成交日等于结束日 | 纳入 |
| ZQZY-05 | 到期日等于结束日 | 不纳入 |
| ZQZY-06 | 缺承揽关系或特殊比例 | 按约定处理 |
| ZQZY-07 | 大金额、小比例 | 舍入规则一致 |
| ZQZY-08 | 与明细过程勾稽 | 明细合计等于汇总 |

### 5.4 对比校验 SQL

将结果统一装载为 `ut_old_zqzy_hz/ut_new_zqzy_hz(biz_date,org_name,capital_amt)`：

```sql
SELECT o.biz_date, o.org_name,
       o.capital_amt old_amt, n.capital_amt new_amt,
       n.capital_amt-o.capital_amt diff
  FROM ut_old_zqzy_hz o
  JOIN ut_new_zqzy_hz n
    ON n.biz_date=o.biz_date AND n.org_name=o.org_name
 WHERE ABS(NVL(n.capital_amt,0)-NVL(o.capital_amt,0)) > 0.01;

SELECT m.biz_date, m.org_name,
       SUM(m.capital_amt) detail_amt, h.capital_amt summary_amt
  FROM ut_new_zqzy_mx m
  JOIN ut_new_zqzy_hz h
    ON h.biz_date=m.biz_date AND h.org_name=m.org_name
 GROUP BY m.biz_date, m.org_name, h.capital_amt
HAVING ABS(SUM(m.capital_amt)-h.capital_amt) > 0.01;
```

异常查询应返回 0 行。过程只读，无恢复步骤。必须确认 `retain_amt_percn_yda` 的单位是小数还是百分数。

---

## 6. `pkg_crm_jcjdbb.pro_query_zqzymx_data`

### 6.1 功能分析

输入结束日期，按产品和承揽单位输出未到期余额、承揽比例和经济资本明细。其数据源和计算规则与上一过程一致，但不按承揽单位汇总。

```text
分摊后未到期余额 = rzye × 承揽比例
经济资本 = rzye × 承揽比例 × 0.01% / 12
```

### 6.2 参数和调用 SQL

```sql
@set UT_YWRQ = 2026-07-10

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name)='PKG_CRM_JCJDBB'
   AND UPPER(object_name)='PRO_QUERY_ZQZYMX_DATA'
 ORDER BY sequence;
```

```sql
DECLARE
  v_code   VARCHAR2(20);
  v_note   VARCHAR2(4000);
  v_cursor SYS_REFCURSOR;
BEGIN
  pkg_crm_jcjdbb.pro_query_zqzymx_data(
      '${UT_YWRQ}', v_code, v_note, v_cursor);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
  DBMS_SQL.RETURN_RESULT(v_cursor);
END;
```

### 6.3 功能用例

| 编号 | 场景 | 预期 |
|---|---|---|
| ZQMX-01 | 普通机构 | 使用 `trans_income_rate/100` |
| ZQMX-02 | 特殊机构 385580 | 使用收入保留比例 |
| ZQMX-03 | 一个产品多个承揽单位 | 每个关系分别输出 |
| ZQMX-04 | 成交/到期边界 | 只取真实未到期交易 |
| ZQMX-05 | 无承揽关系或比例为空 | 按约定处理 |
| ZQMX-06 | 金额为 0 或 NULL | 经济资本符合空值规则 |
| ZQMX-07 | 大金额、小比例 | 四位小数舍入一致 |
| ZQMX-08 | 与汇总过程勾稽 | 按单位合计等于汇总 |

### 6.4 对比校验 SQL

将新旧结果统一装载为：

```text
ut_old_zqzy_mx / ut_new_zqzy_mx
(biz_date, prod_name, manager_name, allocated_rzye,
 org_name, allocation_rate, capital_rate, capital_amt)
```

```sql
SELECT o.biz_date, o.prod_name, o.org_name,
       o.allocated_rzye old_rzye, n.allocated_rzye new_rzye,
       o.capital_amt old_capital, n.capital_amt new_capital
  FROM ut_old_zqzy_mx o
  JOIN ut_new_zqzy_mx n
    ON n.biz_date=o.biz_date
   AND n.prod_name=o.prod_name
   AND n.org_name=o.org_name
 WHERE ABS(NVL(n.allocated_rzye,0)-NVL(o.allocated_rzye,0)) > 0.01
    OR ABS(NVL(n.capital_amt,0)-NVL(o.capital_amt,0)) > 0.0001;

SELECT biz_date, prod_name, org_name, allocated_rzye,
       allocation_rate, capital_amt
  FROM ut_new_zqzy_mx
 WHERE ABS(NVL(capital_amt,0)
           - NVL(allocated_rzye,0)*0.01/100/12) > 0.0001;
```

异常查询应返回 0 行。过程只读，无恢复步骤。

---

## 7. `pkg_tg_zqzyshg.pro_gen_report_data_rzye_all`

### 7.1 功能分析

按业务日期和业务类型生成 `t_crm_zqzyshg_rzye`：

- `service_type='0'` 使用质押式科目 `22020101/22020201`。
- `service_type='1'` 使用协议回购科目 `22020104/22020204`。

```text
enhgje = enhgje1 + enhgje2
hggg = enhgje / zcjz
市场杠杆 = 持有量 / (持有量 - 市场正回购)
全市场杠杆 = 总持有量 / (总持有量 - 总正回购)
总体杠杆 = 总资产 / (总资产 - 总负债)
亿元字段 = 原金额 / 100000000
```

重点验证两个业务类型互不覆盖、所有除零分支、还本处理、重跑幂等性和逐产品循环的事务完整性。

### 7.2 参数、备份和调用 SQL

```sql
@set UT_YWRQ = 2026-07-10
@set UT_SERVICE = 0
@set UT_SUFFIX = 260806

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name)='PKG_TG_ZQZYSHG'
   AND UPPER(object_name)='PRO_GEN_REPORT_DATA_RZYE_ALL'
 ORDER BY sequence;

CREATE TABLE ut_bak_rzye_${UT_SUFFIX} AS
SELECT * FROM t_crm_zqzyshg_rzye
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND service_type IN ('0','1');
```

```sql
DECLARE
  v_code VARCHAR2(20);
  v_note VARCHAR2(4000);
BEGIN
  pkg_tg_zqzyshg.pro_gen_report_data_rzye_all(
      '${UT_YWRQ}', '${UT_SERVICE}', v_code, v_note);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
END;
```

日期入参如为 `DATE`，改用 `TO_DATE('${UT_YWRQ}','YYYY-MM-DD')`。

### 7.3 功能用例

| 编号 | 场景 | 预期 |
|---|---|---|
| RZ-01 | service_type=0 | 只使用质押式科目 |
| RZ-02 | service_type=1 | 只使用协议回购科目 |
| RZ-03 | 同日依次执行 0、1 | 两类数据都保留 |
| RZ-04 | 有还本债券 | 使用最近剩余本金 |
| RZ-05 | 资产净值为 0 | 不出现未处理异常 |
| RZ-06 | 持有量等于回购额 | 市场杠杆按约定处理 |
| RZ-07 | 总资产等于总负债 | 总体杠杆按约定处理 |
| RZ-08 | 同日同类型重跑 | 结果不变 |
| RZ-09 | 循环远端查询失败 | 无半成品 |

### 7.4 校验 SQL

```sql
-- 重复键
SELECT ywrq, service_type, prod_code, COUNT(*) cnt
  FROM t_crm_zqzyshg_rzye
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
 GROUP BY ywrq, service_type, prod_code
HAVING COUNT(*) > 1;

-- 金额和亿元换算
SELECT prod_code, service_type, enhgje1, enhgje2, enhgje,
       zcjz, zcjzy, enhgje1y, enhgje2y, enhgjey
  FROM t_crm_zqzyshg_rzye
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND (ABS(NVL(enhgje,0)-NVL(enhgje1,0)-NVL(enhgje2,0)) > 0.01
        OR ABS(NVL(zcjzy,0)-NVL(zcjz,0)/100000000) > 0.00000001
        OR ABS(NVL(enhgje1y,0)-NVL(enhgje1,0)/100000000) > 0.00000001
        OR ABS(NVL(enhgje2y,0)-NVL(enhgje2,0)/100000000) > 0.00000001
        OR ABS(NVL(enhgjey,0)-NVL(enhgje,0)/100000000) > 0.00000001);

-- 回购杠杆
SELECT prod_code, service_type, enhgje, zcjz, hggg,
       enhgje/NULLIF(zcjz,0) expected_hggg
  FROM t_crm_zqzyshg_rzye
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND zcjz<>0
   AND ABS(NVL(hggg,0)-enhgje/zcjz) > 0.00000001;

-- 两个业务类型保留情况
SELECT service_type, COUNT(*) cnt, SUM(enhgje) total_amt
  FROM t_crm_zqzyshg_rzye
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
 GROUP BY service_type;
```

### 7.5 恢复 SQL

```sql
DELETE FROM t_crm_zqzyshg_rzye
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND service_type IN ('0','1');
INSERT INTO t_crm_zqzyshg_rzye SELECT * FROM ut_bak_rzye_${UT_SUFFIX};
COMMIT;
```

---

## 8. `pkg_tg_zqzyshg.pro_gen_report_data_jd_all`

### 8.1 功能分析

按业务日期生成季度报送/压力测试数据。过程刷新沪深质押券临时表并写 `t_crm_zqzyshg_jd`，随后更新评级、质押券余额汇总、融资余额汇总、发行人集中度、标准券数量、分档比例和欠库金额。

完整服务还会使用集团内评结果做 Java 后处理，覆盖存储过程的初始评级分档。

```text
上海质押券余额 = sl1 × zqmgmz / 100
深圳质押券数量 = jgjssl × 100
zyqyehz = 同产品 SUM(zyqye)
fxrjzd = ROUND(zyqye / zyqyehz, 4) × 100%
bzqsl = zyqye × zsl
bzqsl1/2/3 = bzqsl × ratio1/2/3
qkje1/2/3 = (同产品分档标准券数量之和 - rzyehz) / 10000
```

### 8.2 参数、前置条件和备份

```sql
@set UT_YWRQ = 2026-07-10
@set UT_SUFFIX = 260806

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name)='PKG_TG_ZQZYSHG'
   AND UPPER(object_name)='PRO_GEN_REPORT_DATA_JD_ALL'
 ORDER BY sequence;

SELECT jd, COUNT(*) cnt
  FROM t_crm_rzhgyc_jtnbpj
 GROUP BY jd
 ORDER BY jd DESC;

SELECT jtnp, light, middle, heavy
  FROM t_crm_ycqj_config
 ORDER BY jtnp;

CREATE TABLE ut_bak_jd_${UT_SUFFIX} AS
SELECT * FROM t_crm_zqzyshg_jd
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD');

CREATE TABLE ut_bak_sh_${UT_SUFFIX} AS
SELECT * FROM tjk_jyqs_qtsl
 WHERE d_ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD');

CREATE TABLE ut_bak_sz_${UT_SUFFIX} AS
SELECT * FROM tjk_szqs_v52_sjsjg
 WHERE d_ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD');
```

### 8.3 调用 SQL

```sql
DECLARE
  v_code VARCHAR2(20);
  v_note VARCHAR2(4000);
BEGIN
  pkg_tg_zqzyshg.pro_gen_report_data_jd_all(
      '${UT_YWRQ}', v_code, v_note);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
END;
```

独立调用只验证过程内步骤；完整验收还要触发 `genDataJdAll` 服务，以执行集团内评后处理。

### 8.4 功能用例

| 编号 | 场景 | 预期 |
|---|---|---|
| JD-01 | 当季无集团内评 | 服务层调用前失败 |
| JD-02 | 上海质押券 | 市场、数量、余额正确 |
| JD-03 | 深圳质押券 | `zyqsl=jgjssl×100` |
| JD-04 | 不同评级组合 | 综合评级和初始分档正确 |
| JD-05 | 发行人命中内评 | Java 配置比例覆盖 |
| JD-06 | 未命中内评 | 按主体评级降级 |
| JD-07 | 产品多债券/发行人 | 汇总和集中度正确 |
| JD-08 | `zyqyehz=0` 或折算率为空 | 按约定处理 |
| JD-09 | 同日重跑 | 临时表和主表无重复 |
| JD-10 | DBLINK 中途失败 | 无半成品 |

### 8.5 校验 SQL

```sql
-- 业务键重复
SELECT ywrq, prod_id, zqdm, l_sclb, COUNT(*) cnt
  FROM t_crm_zqzyshg_jd
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
 GROUP BY ywrq, prod_id, zqdm, l_sclb
HAVING COUNT(*) > 1;

-- 基础公式
SELECT id, prod_code, zqdm, zyqsl, zqmgmz, zyqye, zsl, bzqsl
  FROM t_crm_zqzyshg_jd
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND (ABS(NVL(zyqye,0)-NVL(zyqsl,0)*NVL(zqmgmz,0)/100) > 0.01
        OR ABS(NVL(bzqsl,0)-NVL(zyqye,0)*NVL(zsl,0)) > 0.01);

-- 产品汇总
WITH x AS (
  SELECT t.*,
         SUM(NVL(zyqye,0)) OVER (PARTITION BY prod_id) calc_zyqyehz
    FROM t_crm_zqzyshg_jd t
   WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
)
SELECT id, prod_code, zqdm, zyqye, zyqyehz, calc_zyqyehz
  FROM x
 WHERE ABS(NVL(zyqyehz,0)-calc_zyqyehz) > 0.01;

-- 分档数量
SELECT id, prod_code, bzqsl,
       bzqsl_ratio1, bzqsl1,
       bzqsl_ratio2, bzqsl2,
       bzqsl_ratio3, bzqsl3
  FROM t_crm_zqzyshg_jd
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND (ABS(NVL(bzqsl1,0)-NVL(bzqsl,0)*NVL(bzqsl_ratio1,0)) > 0.01
        OR ABS(NVL(bzqsl2,0)-NVL(bzqsl,0)*NVL(bzqsl_ratio2,0)) > 0.01
        OR ABS(NVL(bzqsl3,0)-NVL(bzqsl,0)*NVL(bzqsl_ratio3,0)) > 0.01);

-- 集团内评覆盖
SELECT j.id, j.fxr, n.npjg, c.light, c.middle, c.heavy,
       j.bzqsl_ratio1, j.bzqsl_ratio2, j.bzqsl_ratio3
  FROM t_crm_zqzyshg_jd j
  JOIN t_crm_rzhgyc_jtnbpj n ON n.fzztmc=j.fxr
  JOIN t_crm_ycqj_config c ON c.jtnp=n.npjg
 WHERE j.ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD')
   AND (NVL(j.bzqsl_ratio1,-1)<>NVL(c.light,-1)
        OR NVL(j.bzqsl_ratio2,-1)<>NVL(c.middle,-1)
        OR NVL(j.bzqsl_ratio3,-1)<>NVL(c.heavy,-1));
```

### 8.6 恢复 SQL

```sql
DELETE FROM t_crm_zqzyshg_jd
 WHERE ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD');
INSERT INTO t_crm_zqzyshg_jd SELECT * FROM ut_bak_jd_${UT_SUFFIX};

DELETE FROM tjk_jyqs_qtsl
 WHERE d_ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD');
INSERT INTO tjk_jyqs_qtsl SELECT * FROM ut_bak_sh_${UT_SUFFIX};

DELETE FROM tjk_szqs_v52_sjsjg
 WHERE d_ywrq=TO_DATE('${UT_YWRQ}','YYYY-MM-DD');
INSERT INTO tjk_szqs_v52_sjsjg SELECT * FROM ut_bak_sz_${UT_SUFFIX};
COMMIT;
```

---

## 9. `pkg_ins_wsq_hkzl.pro_gen_tazl_data`

### 9.1 功能分析

按业务日期和 TA 指令 ID 读取 TA 数据，关联产品和银行字典，然后新增或更新 `t_ins_wsq_hkzl`，最后补全开户行、省份、地区、支付号/联行号及 PPOS 授权状态。

| hklb | 费用类别 | fylb |
|---|---|---|
| 1042 | 管理费 | 1 |
| 1188 | 指数费 | 8 |
| 1047 | 销售服务费 | 6 |

无费用授权时 `zlly=6`；命中 PPOS 自动支付授权时 `zlly=11`。

附件同时出现 `RKL_SID` 和 `RKLSID`，执行前必须查询真实字段名。以下 SQL 假设真实字段为 `RKL_SID`。

### 9.2 参数、字段和样本检查

```sql
@set UT_YWRQ8 = 20260710
@set UT_RKLS_ID = 请替换为SIT中的TA指令ID
@set UT_SUFFIX = 260806

SELECT owner, package_name, object_name, position,
       argument_name, in_out, data_type, type_name
  FROM all_arguments
 WHERE UPPER(package_name)='PKG_INS_WSQ_HKZL'
   AND UPPER(object_name)='PRO_GEN_TAZL_DATA'
 ORDER BY sequence;

SELECT column_id, column_name, data_type, data_length, nullable
  FROM user_tab_columns
 WHERE table_name='T_INS_WSQ_HKZL'
 ORDER BY column_id;

SELECT * FROM vw_zjqs_ppostgzl@linktoorcl WHERE ROWNUM <= 20;

SELECT ywrq, gzrq, prod_code, hklb, zyxx, hkje,
       rkl_sid, ddbh, sync_status, zlly
  FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND ROWNUM <= 50;
```

### 9.3 备份和调用 SQL

```sql
CREATE TABLE ut_bak_ta_${UT_SUFFIX} AS
SELECT * FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND rkl_sid='${UT_RKLS_ID}';
```

```sql
DECLARE
  v_code VARCHAR2(20);
  v_note VARCHAR2(4000);
BEGIN
  pkg_ins_wsq_hkzl.pro_gen_tazl_data(
      '${UT_YWRQ8}', '${UT_RKLS_ID}', v_code, v_note);
  DBMS_OUTPUT.PUT_LINE('o_code=' || v_code);
  DBMS_OUTPUT.PUT_LINE('o_note=' || v_note);
END;
```

### 9.4 功能用例

| 编号 | 场景 | 预期 |
|---|---|---|
| TA-01 | TA 无该 ID | `o_code=0`，本地无变化 |
| TA-02 | 本地无业务键 | 新增，新订单号，`sync_status=0` |
| TA-03 | 历史存在、当日不存在 | 复用订单号新增 |
| TA-04 | 当日已经存在 | 更新，不新增重复行 |
| TA-05 | 三类特殊费用且有授权 | fylb、zlly 正确 |
| TA-06 | 特殊费用无授权 | `zlly=6` |
| TA-07 | 清算账户存在 | 账户信息正确回填 |
| TA-08 | 命中 PPOS 授权 | `zlly=11` |
| TA-09 | 重复回调 | 行数不增加、订单号稳定 |
| TA-10 | 后处理失败 | 无部分新增或部分补全状态 |

### 9.5 校验 SQL

```sql
-- 结果总览
SELECT hkzl_id, ywrq, gzrq, prod_id, prod_code, fylb, hklb,
       zyxx, hkje, ddbh, sync_status, source_app, qrzt, zlly,
       dsfzh, dsfzhbh, dsfzhyhdm, dsfkhhmc, dsfdezfh,
       dsfkhhsf, dsfkffdq, update_time
  FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND rkl_sid='${UT_RKLS_ID}'
 ORDER BY hkzl_id;

-- 业务键重复
SELECT gzrq, prod_code, hklb, zyxx, hkje, rkl_sid, COUNT(*) cnt
  FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND rkl_sid='${UT_RKLS_ID}'
 GROUP BY gzrq, prod_code, hklb, zyxx, hkje, rkl_sid
HAVING COUNT(*) > 1;

-- 固定值和总行编号
SELECT hkzl_id, qrzt, source_app, sync_status, dsfzhbh, dsfzhyhdm
  FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND rkl_sid='${UT_RKLS_ID}'
   AND (qrzt<>'1' OR source_app<>'2' OR sync_status<>'0'
        OR NVL(dsfzhbh,'#')<>NVL(dsfzhyhdm,'#'));

-- 费用类别映射
SELECT hkzl_id, hklb, fylb, zlly
  FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND rkl_sid='${UT_RKLS_ID}'
   AND ((hklb='1042' AND fylb<>'1')
     OR (hklb='1188' AND fylb<>'8')
     OR (hklb='1047' AND fylb<>'6'));
```

### 9.6 恢复 SQL

```sql
DELETE FROM t_ins_wsq_hkzl
 WHERE ywrq=TO_DATE('${UT_YWRQ8}','YYYYMMDD')
   AND rkl_sid='${UT_RKLS_ID}';
INSERT INTO t_ins_wsq_hkzl SELECT * FROM ut_bak_ta_${UT_SUFFIX};
COMMIT;
```

---

## 10. 新旧实现统一对比步骤

### 10.1 查询型过程

1. 冻结远端数据时点。
2. 在 DBeaver 调用原过程并导出结果集。
3. 调用 Java/Doris 新接口并导出结果。
4. 统一日期、NULL、百分号和小数格式。
5. 比较记录数、业务键、金额、比例和展示格式。

### 10.2 生成型过程

1. 创建本过程章节中定义的备份表。
2. 执行原过程，将结果复制到 `UT_OLD_*`。
3. 恢复执行前数据。
4. 触发 Java/Doris 新实现，将结果复制到 `UT_NEW_*`。
5. 排除随机主键和审计时间，使用双向 `MINUS` 比较业务字段。
6. 再执行一次新实现验证幂等性。
7. 执行恢复 SQL并核对恢复行数。

## 11. 统一通过标准

- 过程对象和真实参数签名正确。
- `o_code/o_note` 与原过程一致。
- 新旧实现业务键集合一致，无重复、漏数或额外数据。
- 金额差异不超过 0.01 元；四位小数字段差异不超过 0.0001。
- 汇总过程与明细过程能够相互勾稽。
- 同参数重跑结果不变。
- 远端异常不会产生不可恢复的半成品。
- 生成型过程的数据已恢复并与备份行数一致。

## 12. 测试前必须关闭的问题

1. `pro_gen_product_rel_data` 应写正式表还是带日期后缀的备份表？
2. 产品债券和面值更新是否需要 `cp_type='2'`？
3. 回购扣减余额等于 0 时是否停止，最后一笔是否允许超过余额？
4. 各生成型过程是否内部执行 `COMMIT`？
5. 所有比例和杠杆分母为 0 时返回 NULL、0 还是失败？
6. `retain_amt_percn_yda` 的单位是小数还是百分数？
7. 欠库金额公式的正负方向是否符合业务定义？
8. TA 流水字段真实名称是 `RKL_SID` 还是 `RKLSID`？
9. Doris Catalog 与 Oracle DBLINK 的允许刷新延迟是多少？

其中第 1、4、5、8 项会直接影响数据完整性或 SQL 能否执行，必须在功能测试开始前确认。
