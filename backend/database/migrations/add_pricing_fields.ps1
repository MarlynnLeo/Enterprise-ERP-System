# PowerShell脚本 - 批量添加定价策略字段
# 使用UTF-8编码确保中文正确显示

$host.UI.RawUI.OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 数据库连接信息
$dbHost = $env:DB_HOST
if ([string]::IsNullOrEmpty($dbHost)) { $dbHost = "localhost" }
$dbPort = $env:DB_PORT
if ([string]::IsNullOrEmpty($dbPort)) { $dbPort = "3306" }
$dbUser = $env:DB_USER
if ([string]::IsNullOrEmpty($dbUser)) { $dbUser = "root" }
$dbPass = $env:DB_PASSWORD
$dbName = $env:DB_NAME
if ([string]::IsNullOrEmpty($dbName)) { $dbName = "mes" }
$dbName = "mes"

# 定义所有字段
$fields = @(
    @{name="material_amount"; label="材料金额"; type="amount"; unit="元"; order=20; desc="原材料总金额"},
    @{name="labor_cost"; label="工资"; type="amount"; unit="元/件"; order=40; desc="单件产品的人工成本"},
    @{name="mold_amortization"; label="模具摊销费"; type="amount"; unit="元/件"; order=50; desc="模具成本分摊"},
    @{name="fixed_cost"; label="固定费用"; type="amount"; unit="元"; order=60; desc="固定成本费用"},
    @{name="fixed_cost_rate"; label="固定费用比例"; type="percentage"; unit="%"; order=70; desc="固定费用占比"},
    @{name="mold_opening_cost"; label="开模费用"; type="amount"; unit="元"; order=80; desc="模具开发费用"},
    @{name="tax_rate"; label="税率"; type="percentage"; unit="%"; order=90; desc="适用税率"},
    @{name="tax_amount"; label="税额"; type="amount"; unit="元"; order=100; desc="应缴税额"},
    @{name="cost_price"; label="成本价"; type="amount"; unit="元"; order=110; desc="产品总成本"},
    @{name="gross_profit"; label="毛利额"; type="amount"; unit="元"; order=120; desc="毛利润金额"},
    @{name="gross_profit_rate"; label="毛利率"; type="percentage"; unit="%"; order=130; desc="毛利润率"},
    @{name="planned_factory_price"; label="计划出厂价"; type="amount"; unit="元"; order=140; desc="计划出厂价格"},
    @{name="final_selling_price"; label="决定售价"; type="amount"; unit="元"; order=150; desc="最终销售价格"},
    @{name="final_selling_price_usd"; label="决定售价(USD)"; type="amount"; unit="USD"; order=160; desc="最终售价美元"},
    @{name="exchange_rate"; label="汇率"; type="amount"; unit=""; order=170; desc="货币汇率"},
    @{name="price_difference"; label="差价"; type="amount"; unit="元"; order=180; desc="价格差异"},
    @{name="price_difference_rate"; label="差价率"; type="percentage"; unit="%"; order=190; desc="价格差异率"},
    @{name="original_material_amount"; label="原材料金额"; type="amount"; unit="元"; order=200; desc="原材料金额"},
    @{name="original_material_loss_rate"; label="原材料损耗率"; type="percentage"; unit="%"; order=210; desc="原材料损耗率"},
    @{name="original_labor_cost"; label="原工资"; type="amount"; unit="元/件"; order=220; desc="原人工成本"},
    @{name="original_mold_opening_cost"; label="原开模费用"; type="amount"; unit="元"; order=230; desc="原开模费用"},
    @{name="original_mold_amortization"; label="原模具摊销费"; type="amount"; unit="元/件"; order=240; desc="原模具摊销"},
    @{name="original_fixed_cost_rate"; label="原固定费用比例"; type="percentage"; unit="%"; order=250; desc="原固定费用比例"},
    @{name="original_fixed_cost"; label="原固定费用"; type="amount"; unit="元"; order=260; desc="原固定费用"},
    @{name="original_tax_rate"; label="原税率"; type="percentage"; unit="%"; order=270; desc="原税率"},
    @{name="original_tax_amount"; label="原税额"; type="amount"; unit="元"; order=280; desc="原税额"},
    @{name="original_cost_price"; label="原成本价"; type="amount"; unit="元"; order=290; desc="原成本价"},
    @{name="original_gross_profit"; label="原毛利额"; type="amount"; unit="元"; order=300; desc="原毛利额"},
    @{name="original_gross_profit_rate"; label="原毛利率"; type="percentage"; unit="%"; order=310; desc="原毛利率"},
    @{name="original_planned_factory_price"; label="原计划出厂价"; type="amount"; unit="元"; order=320; desc="原计划出厂价"},
    @{name="original_final_selling_price"; label="原决定售价"; type="amount"; unit="元"; order=330; desc="原决定售价"},
    @{name="original_final_selling_price_usd"; label="原决定售价(USD)"; type="amount"; unit="USD"; order=340; desc="原决定售价美元"},
    @{name="original_exchange_rate"; label="原汇率"; type="amount"; unit=""; order=350; desc="原汇率"},
    @{name="original_product_lifetime"; label="原成品使用寿命"; type="amount"; unit="次"; order=360; desc="原产品寿命"},
    @{name="warning_price_difference"; label="预警差价"; type="amount"; unit="元"; order=370; desc="差价预警值"},
    @{name="warning_price_difference_rate"; label="预警差价率"; type="percentage"; unit="%"; order=380; desc="差价率预警"}
)

Write-Host "开始插入字段..." -ForegroundColor Green

foreach ($field in $fields) {
    $sql = "INSERT IGNORE INTO pricing_strategy_fields (field_name, field_label, field_type, unit, sort_order, description, is_active) VALUES ('$($field.name)', '$($field.label)', '$($field.type)', '$($field.unit)', $($field.order), '$($field.desc)', 1);"
    
    $passArg = "-p$dbPass"
    $result = & mysql -h $dbHost -P $dbPort -u $dbUser $passArg $dbName --default-character-set=utf8mb4 -e $sql 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ $($field.label)" -ForegroundColor Green
    } else {
        Write-Host "✗ $($field.label) - $result" -ForegroundColor Red
    }
}

Write-Host "`n插入完成!验证数据..." -ForegroundColor Cyan
$passArg = "-p$dbPass"
& mysql -h $dbHost -P $dbPort -u $dbUser $passArg $dbName --default-character-set=utf8mb4 -e "SELECT COUNT(*) as total FROM pricing_strategy_fields WHERE is_active=1;"
