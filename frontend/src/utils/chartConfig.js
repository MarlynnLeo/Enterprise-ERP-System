/**
 * 图表配置工具函数
 */

import { formatCurrency, formatPercentage } from './dashboardUtils';

/**
 * 基础图表配置
 */
export const baseChartConfig = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        usePointStyle: true,
        pointStyle: 'rectRounded',
        padding: 24,
        font: {
          size: 13,
          family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          weight: '500'
        },
        color: '#606266'
      }
    },
    tooltip: {
      backgroundColor: 'rgba(25, 28, 34, 0.95)',
      titleColor: '#F3F4F6',
      bodyColor: '#D1D5DB',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      cornerRadius: 10,
      padding: 14,
      boxPadding: 8,
      usePointStyle: true,
      displayColors: true,
      intersect: false,
      mode: 'index',
      titleFont: { size: 14, weight: 'bold', family: "'Inter', sans-serif" },
      bodyFont: { size: 13 }
    }
  },
  interaction: {
    intersect: false,
    mode: 'index'
  },
  animation: {
    duration: 1200,
    easing: 'easeOutQuart'
  }
};

/**
 * 柱状图配置
 */
export const barChartConfig = {
  ...baseChartConfig,
  elements: {
    bar: {
      borderRadius: 6,
      borderSkipped: false
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          size: 11
        },
        color: '#8A8F99'
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.04)',
        lineWidth: 1,
        borderDash: [5, 5]
      },
      border: {
        display: false
      },
      ticks: {
        font: {
          size: 11
        },
        color: '#8A8F99'
      }
    }
  }
};

/**
 * 线性图配置
 */
export const lineChartConfig = {
  ...baseChartConfig,
  elements: {
    line: {
      tension: 0.45,
      borderWidth: 3
    },
    point: {
      radius: 0,
      hoverRadius: 8,
      borderWidth: 2,
      backgroundColor: '#ffffff',
      hoverBorderWidth: 3
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          size: 11
        },
        color: '#8A8F99'
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.04)',
        lineWidth: 1,
        borderDash: [5, 5]
      },
      border: {
        display: false
      },
      ticks: {
        font: {
          size: 11
        },
        color: '#8A8F99'
      }
    }
  }
};

/**
 * 饼图配置
 */
export const pieChartConfig = {
  ...baseChartConfig,
  elements: {
      arc: {
          borderWidth: 3,
          borderColor: '#ffffff'
      }
  },
  plugins: {
    ...baseChartConfig.plugins,
    legend: {
      position: 'right',
      labels: {
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 20,
        font: {
          size: 13
        }
      }
    }
  }
};

/**
 * 环形图配置
 */
export const doughnutChartConfig = {
  ...JSON.parse(JSON.stringify(pieChartConfig)),
  cutout: '70%'
};

/**
 * 颜色配置 (Tech/Modern Vibe)
 */
export const chartColors = {
  primary: ['#3A7AF2', '#14B8A6', '#6366F1', '#8B5CF6', '#F43F5E'],
  success: ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'],
  warning: ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FEF3C7'],
  danger:  ['#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#FEE2E2'],
  info:    ['#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB', '#F3F4F6'],
  gradient: [
    'rgba(58, 122, 242, 0.8)',
    'rgba(16, 185, 129, 0.8)',
    'rgba(245, 158, 11, 0.8)',
    'rgba(239, 68, 68, 0.8)',
    'rgba(107, 114, 128, 0.8)'
  ]
};

/**
 * 创建柱状图配置
 * @param {Object} options - 配置选项
 * @returns {Object} 图表配置
 */
export function createBarChartConfig(options = {}) {
  const config = JSON.parse(JSON.stringify(barChartConfig));
  
  if (options.yAxisFormatter) {
    config.scales.y.ticks.callback = options.yAxisFormatter;
  }
  
  if (options.tooltipFormatter) {
    config.plugins.tooltip.callbacks = {
      label: options.tooltipFormatter
    };
  }
  
  if (options.colors) {
    config.backgroundColor = options.colors;
    config.borderColor = options.colors;
  }
  
  return config;
}

/**
 * 创建线性图配置
 * @param {Object} options - 配置选项
 * @returns {Object} 图表配置
 */
export function createLineChartConfig(options = {}) {
  const config = JSON.parse(JSON.stringify(lineChartConfig));
  
  if (options.yAxisFormatter) {
    config.scales.y.ticks.callback = options.yAxisFormatter;
  }
  
  if (options.tooltipFormatter) {
    config.plugins.tooltip.callbacks = {
      label: options.tooltipFormatter
    };
  }
  
  if (options.fill) {
    config.elements.line.fill = true;
    config.elements.line.backgroundColor = options.fillColor || 'rgba(58, 122, 242, 0.15)';
  }
  
  return config;
}

/**
 * 创建饼图配置
 * @param {Object} options - 配置选项
 * @returns {Object} 图表配置
 */
export function createPieChartConfig(options = {}) {
  const config = JSON.parse(JSON.stringify(pieChartConfig));
  
  if (options.tooltipFormatter) {
    config.plugins.tooltip.callbacks = {
      label: options.tooltipFormatter
    };
  } else {
    config.plugins.tooltip.callbacks = {
      label: function(context) {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
        const percentage = Math.round((value / total) * 100);
        return `${label}: ${percentage}%`;
      }
    };
  }
  
  return config;
}

/**
 * 创建混合图表配置（柱状图+线性图）
 * @param {Object} options - 配置选项
 * @returns {Object} 图表配置
 */
export function createMixedChartConfig(options = {}) {
  const config = JSON.parse(JSON.stringify(barChartConfig));
  
  config.scales.y1 = {
    type: 'linear',
    display: true,
    position: 'right',
    beginAtZero: true,
    grid: {
      drawOnChartArea: false,
    },
    ticks: {
      font: {
        size: 11
      },
      color: '#8A8F99'
    }
  };
  
  if (options.tooltipFormatter) {
    config.plugins.tooltip.callbacks = {
      label: options.tooltipFormatter
    };
  }
  
  return config;
}

/**
 * 财务图表专用配置
 */
export const financeChartConfig = {
  currency: {
    yAxisFormatter: (value) => formatCurrency(value),
    tooltipFormatter: (context) => {
      let label = context.dataset.label || '';
      if (label) {
        label += ': ';
      }
      label += formatCurrency(context.raw);
      return label;
    }
  },
  percentage: {
    yAxisFormatter: (value) => value + '%',
    tooltipFormatter: (context) => {
      let label = context.dataset.label || '';
      if (label) {
        label += ': ';
      }
      label += formatPercentage(context.raw);
      return label;
    }
  }
};

/**
 * 生产图表专用配置
 */
export const productionChartConfig = {
  quantity: {
    yAxisFormatter: (value) => value.toLocaleString('zh-CN'),
    tooltipFormatter: (context) => {
      let label = context.dataset.label || '';
      if (label) {
        label += ': ';
      }
      label += context.raw.toLocaleString('zh-CN') + '件';
      return label;
    }
  },
  rate: {
    yAxisFormatter: (value) => value + '%',
    tooltipFormatter: (context) => {
      let label = context.dataset.label || '';
      if (label) {
        label += ': ';
      }
      label += context.raw + '%';
      return label;
    }
  }
};

/**
 * 响应式图表配置
 * @param {string} breakpoint - 断点 ('mobile', 'tablet', 'desktop')
 * @returns {Object} 响应式配置
 */
export function getResponsiveConfig(breakpoint) {
  const configs = {
    mobile: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 10,
            font: {
              size: 10
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            font: {
              size: 9
            }
          }
        },
        y: {
          ticks: {
            font: {
              size: 9
            }
          }
        }
      }
    },
    tablet: {
      plugins: {
        legend: {
          labels: {
            font: {
              size: 11
            }
          }
        }
      }
    },
    desktop: {}
  };
  
  return configs[breakpoint] || configs.desktop;
}

/**
 * 图表主题配置
 */
export const chartThemes = {
  light: {
    backgroundColor: '#ffffff',
    textColor: '#303133',
    gridColor: 'rgba(0, 0, 0, 0.04)',
    borderColor: 'rgba(0, 0, 0, 0.1)'
  },
  dark: {
    backgroundColor: '#1d1e1f',
    textColor: '#ffffff',
    gridColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)'
  }
};

/**
 * 应用主题到图表配置
 * @param {Object} config - 图表配置
 * @param {string} theme - 主题名称
 * @returns {Object} 应用主题后的配置
 */
export function applyTheme(config, theme = 'light') {
  const themeConfig = chartThemes[theme];
  if (!themeConfig) return config;
  
  const themedConfig = JSON.parse(JSON.stringify(config));
  
  // 应用网格颜色
  if (themedConfig.scales) {
    Object.keys(themedConfig.scales).forEach(scaleKey => {
      if (themedConfig.scales[scaleKey].grid) {
        themedConfig.scales[scaleKey].grid.color = themeConfig.gridColor;
      }
      if (themedConfig.scales[scaleKey].ticks) {
        themedConfig.scales[scaleKey].ticks.color = themeConfig.textColor;
      }
    });
  }
  
  // 应用图例颜色
  if (themedConfig.plugins?.legend?.labels) {
    themedConfig.plugins.legend.labels.color = themeConfig.textColor;
  }
  
  return themedConfig;
}
