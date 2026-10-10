<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CardSide } from '../types/idcard'
import { AGE_RANGE_LIMITS, randomAddress } from '../core/idCardGenerator'
import { MANDATORY_WATERMARK_TEXT, NATIONS } from '../core/templates'
import { useIdCardStore } from '../stores/useIdCardStore'
import FaceUploader from './FaceUploader.vue'

/**
 * 参数面板：所有控件直接绑定 store 的 form/advanced。
 * 任一变更都会触发 store.rebuild()（同步、纯计算），
 * 预览重绘由 IdCardPreview 做 300ms 防抖，导出走 store.exportCard()。
 */
const store = useIdCardStore()
const emit = defineEmits<{ (event: 'export', side: CardSide): void }>()

const manualAddress = ref(false)

const genderOptions = [
  { value: 'random', label: '随机' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
] as const

/** 年龄区间上限 100：勾选「历史规则」后允许把上界推到 AGE_RANGE_LIMITS.max 以复现百年以上号段 */
const ageMax = computed(() => (store.advanced.centuryRule ? AGE_RANGE_LIMITS.max : AGE_RANGE_LIMITS.sliderMax))

const ageMarks = computed<Record<number, string>>(() => ({
  [AGE_RANGE_LIMITS.sliderMin]: String(AGE_RANGE_LIMITS.sliderMin),
  60: '60',
  [ageMax.value]: String(ageMax.value),
}))

const validTo = computed<string>({
  get: () => (store.form.longTerm ? '' : store.form.validTo),
  set: (value) => {
    if (!store.form.longTerm) store.form.validTo = value
  },
})

const validityTermLabel = computed(() =>
  store.validityRule.term === 'long' ? '长期有效' : `${store.validityRule.term} 年`,
)

// 选完省市自动填一条演示住址；用户手动编辑过就不再覆盖
watch(
  () => [store.form.region[0], store.form.region[1]] as const,
  ([province, city]) => {
    if (manualAddress.value || !province || !city) return
    store.form.address = randomAddress(province, city)
  },
)

function onAddressInput(): void {
  manualAddress.value = true
}

function pickRandomName(): void {
  store.randomize()
  manualAddress.value = false
}

function resetAll(): void {
  store.reset()
  manualAddress.value = false
}
</script>

<template>
  <div class="param-panel">
    <el-form class="param-panel__form" label-width="88px" label-position="right">
      <el-form-item label="姓名">
        <el-input v-model="store.form.name" maxlength="20" placeholder="脱敏演示姓名">
          <template #append>
            <el-button @click="pickRandomName">重掷</el-button>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="性别">
        <el-radio-group v-model="store.form.gender">
          <el-radio v-for="g in genderOptions" :key="g.value" :value="g.value">{{ g.label }}</el-radio>
        </el-radio-group>
        <span v-if="store.form.gender === 'random'" class="param-panel__hint">
          本次解析为{{ store.effectiveGender === 'male' ? '男' : '女' }}
        </span>
      </el-form-item>

      <el-form-item label="民族">
        <el-select v-model="store.form.nation" filterable placeholder="选择民族">
          <el-option v-for="n in NATIONS" :key="n" :label="n" :value="n" />
        </el-select>
      </el-form-item>

      <el-form-item label="生日来源">
        <el-radio-group v-model="store.form.birthdayMode">
          <el-radio value="range">年龄区间</el-radio>
          <el-radio value="assign">指定生日</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="store.form.birthdayMode === 'assign'" label="指定生日">
        <el-date-picker
          v-model="store.form.birthday"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择出生日期"
          :disabled-date="(d: Date) => d.getTime() > Date.now()"
        />
      </el-form-item>

      <el-form-item v-else label="年龄区间">
        <div class="param-panel__slider">
          <el-slider
            v-model="store.form.ageRange"
            class="param-panel__age-slider"
            range
            :min="AGE_RANGE_LIMITS.sliderMin"
            :max="ageMax"
            :marks="ageMarks"
          />
          <p class="param-panel__range">
            {{ store.form.ageRange[0] }} ~ {{ store.form.ageRange[1] }} 岁 · 区间内随机取生日
          </p>
        </div>
      </el-form-item>

      <el-form-item label="省 / 市">
        <el-cascader
          v-model="store.form.region"
          :options="store.provinceOptions"
          placeholder="选择省市（演示用脱敏表）"
          :props="{ expandTrigger: 'hover' }"
        />
      </el-form-item>

      <el-form-item label="住址">
        <el-input
          v-model="store.form.address"
          type="textarea"
          :rows="2"
          maxlength="60"
          show-word-limit
          placeholder="省市区 + 街道 + 门牌"
          @update:model-value="onAddressInput"
        />
      </el-form-item>

      <el-form-item label="签发机关">
        <el-input v-model="store.form.issueAuthority" maxlength="30" placeholder="如：XX市公安局演示分局" />
      </el-form-item>

      <el-form-item label="有效期起">
        <el-date-picker v-model="store.form.validFrom" type="date" value-format="YYYY-MM-DD" placeholder="签发日期" />
      </el-form-item>

      <el-form-item label="有效期止">
        <el-date-picker
          v-model="validTo"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled="store.form.longTerm || store.advanced.autoValidity"
        />
        <el-checkbox
          v-model="store.form.longTerm"
          :disabled="store.advanced.autoValidity"
          class="param-panel__longterm"
        >
          长期
        </el-checkbox>
        <p v-if="store.advanced.autoValidity" class="param-panel__range param-panel__block">
          申领时 {{ store.validityRule.age }} 周岁 → {{ validityTermLabel }}
        </p>
      </el-form-item>

      <el-form-item label="人像">
        <FaceUploader />
      </el-form-item>
    </el-form>

    <el-collapse class="param-panel__advanced">
      <el-collapse-item title="高级选项" name="advanced">
        <el-form label-width="104px" label-position="right">
          <el-form-item label="演示号段">
            <el-switch v-model="store.advanced.demoSegment" />
            <span class="param-panel__hint">{{
              store.advanced.demoSegment ? '99 开头虚构号段' : '按真实区划码规则'
            }}</span>
          </el-form-item>

          <el-form-item label="历史规则">
            <el-switch v-model="store.advanced.centuryRule" />
            <span class="param-panel__hint">满 100 岁强制校验位 X（故意不符合现行校验算法）</span>
          </el-form-item>

          <el-form-item label="有效期档位">
            <el-switch v-model="store.advanced.autoValidity" />
            <span class="param-panel__hint">
              {{ store.advanced.autoValidity ? '按申领周岁推 5/10/20 年或长期' : '手动填写止期，勾选长期' }}
            </span>
          </el-form-item>

          <el-form-item label="水印">
            <el-switch v-model="store.advanced.watermarkEnabled" />
            <span class="param-panel__hint">
              {{ store.advanced.watermarkEnabled ? '预览与导出均叠加' : '已关闭：导出的是干净卡面' }}
            </span>
          </el-form-item>

          <el-form-item label="水印文字">
            <el-input
              v-model="store.advanced.watermarkText"
              :placeholder="MANDATORY_WATERMARK_TEXT"
              :disabled="!store.advanced.watermarkEnabled"
              clearable
            />
            <span class="param-panel__hint">留空则回落强制文案「{{ MANDATORY_WATERMARK_TEXT }}」</span>
          </el-form-item>

          <el-form-item label="水印排布">
            <el-radio-group v-model="store.advanced.watermarkMode" :disabled="!store.advanced.watermarkEnabled">
              <el-radio value="tile">平铺</el-radio>
              <el-radio value="diagonal">对角线</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="水印透明度">
            <el-slider
              v-model="store.advanced.watermarkOpacity"
              :min="0.06"
              :max="0.6"
              :step="0.02"
              :disabled="!store.advanced.watermarkEnabled"
              show-input
            />
          </el-form-item>

          <el-form-item label="水印密度">
            <el-slider
              v-model="store.advanced.watermarkDensity"
              :min="0.5"
              :max="2.5"
              :step="0.1"
              :disabled="!store.advanced.watermarkEnabled"
              show-input
            />
          </el-form-item>

          <el-form-item label="导出倍率">
            <el-radio-group v-model="store.advanced.exportScale">
              <el-radio-button :value="2">2x</el-radio-button>
              <el-radio-button :value="3">3x</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="导出格式">
            <el-radio-group v-model="store.advanced.exportFormat">
              <el-radio-button value="png">PNG</el-radio-button>
              <el-radio-button value="jpg">JPG（q0.92）</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>

    <div class="param-panel__actions">
      <el-button type="primary" @click="pickRandomName">随机生成</el-button>
      <el-button @click="resetAll">重置</el-button>
      <el-divider direction="vertical" />
      <el-button @click="emit('export', 'front')">导出正面</el-button>
      <el-button @click="emit('export', 'back')">导出反面</el-button>
      <el-button @click="emit('export', 'both')">导出双面合并</el-button>
    </div>
  </div>
</template>

<style scoped>
.param-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-panel__form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.param-panel__form :deep(.el-select),
.param-panel__form :deep(.el-cascader),
.param-panel__form :deep(.el-input__wrapper) {
  width: 100%;
}

.param-panel__hint {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.param-panel__longterm {
  margin-left: 10px;
}

.param-panel__slider {
  width: 100%;
}

/* 刻度文字是绝对定位画在 32px 盒子外的（margin-top:15px），不预留位置就会被下一行「省 / 市」压住 */
.param-panel__age-slider {
  margin-bottom: 24px;
}

.param-panel__age-slider :deep(.el-slider__marks-text) {
  margin-top: 7px;
  font-size: 12px;
}

.param-panel__range {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

/* el-form-item__content 是 flex-wrap: wrap，占满一行才能换到控件下方而不是挤掉日期选择器 */
.param-panel__block {
  width: 100%;
}

.param-panel__advanced {
  border-top: 1px dashed var(--app-border, #dcdfe6);
  padding-top: 4px;
}

.param-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 6px 0 2px;
}
</style>
