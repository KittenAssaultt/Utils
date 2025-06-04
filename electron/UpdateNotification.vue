<template>
  <div class="update-notification-container" v-if="showNotification">
    <transition name="slide-fade">
      <div class="update-notification" :class="{ 'with-progress': showProgress }">
        <div class="update-icon">
          <i class="bi" :class="getStatusIcon"></i>
        </div>
        <div class="update-content">
          <div class="update-title">{{ title }}</div>
          <div class="update-message">{{ message }}</div>
          <div class="update-progress" v-if="showProgress">
            <el-progress :percentage="downloadProgress" :stroke-width="8" :show-text="false" />
            <div class="progress-text">{{ Math.floor(downloadProgress) }}%</div>
          </div>
          <div class="update-actions" v-if="showActions">
            <el-button 
              v-if="updateAvailable && !downloadStarted" 
              type="primary" 
              size="small" 
              @click="downloadUpdate"
              :loading="checking"
            >
              下载更新
            </el-button>
            <el-button 
              v-if="updateDownloaded" 
              type="success" 
              size="small" 
              @click="installUpdate"
            >
              立即安装
            </el-button>
            <el-button 
              v-if="showCheckButton" 
              type="primary" 
              size="small" 
              @click="checkForUpdates"
              :loading="checking"
            >
              检查更新
            </el-button>
            <el-button 
              size="small" 
              @click="close"
            >
              关闭
            </el-button>
          </div>
        </div>
        <div class="close-button" @click="close" v-if="!downloadStarted || updateDownloaded">
          <i class="bi bi-x"></i>
        </div>
      </div>
    </transition>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue'

export default defineComponent({
  name: 'UpdateNotification',
  
  setup() {
    // 状态变量
    const showNotification = ref(false)
    const title = ref('软件更新')
    const message = ref('')
    const updateAvailable = ref(false)
    const updateDownloaded = ref(false)
    const downloadStarted = ref(false)
    const downloadProgress = ref(0)
    const showProgress = ref(false)
    const showActions = ref(true)
    const checking = ref(false)
    const showCheckButton = ref(true)
    const error = ref(false)
    
    // 根据当前状态计算图标
    const getStatusIcon = computed(() => {
      if (error.value) return 'bi-exclamation-triangle-fill'
      if (checking.value) return 'bi-arrow-repeat'
      if (updateDownloaded.value) return 'bi-check-circle-fill'
      if (updateAvailable.value) return 'bi-cloud-arrow-down-fill'
      return 'bi-info-circle-fill'
    })
    
    // 检查更新
    const checkForUpdates = () => {
      checking.value = true
      showNotification.value = true
      title.value = '正在检查更新...'
      message.value = '正在连接服务器检查新版本...'
      showCheckButton.value = false
      window.electron.ipcRenderer.send('check-for-updates')
    }
    
    // 下载更新
    const downloadUpdate = () => {
      downloadStarted.value = true
      showProgress.value = true
      title.value = '正在下载更新...'
      message.value = '更新正在下载中，请稍候...'
      window.electron.ipcRenderer.send('download-update')
    }
    
    // 安装更新
    const installUpdate = () => {
      window.electron.ipcRenderer.send('install-update')
    }
    
    // 关闭通知
    const close = () => {
      if (downloadStarted.value && !updateDownloaded.value) return
      showNotification.value = false
      // 重置状态
      setTimeout(() => {
        if (!showNotification.value) {
          updateAvailable.value = false
          updateDownloaded.value = false
          downloadStarted.value = false
          downloadProgress.value = 0
          showProgress.value = false
          checking.value = false
          showCheckButton.value = true
          error.value = false
        }
      }, 300)
    }
    
    // 监听更新事件
    onMounted(() => {
      // 检查更新事件
      window.electron.ipcRenderer.on('checking-for-update', (_event) => {
        showNotification.value = true
        title.value = '正在检查更新...'
        message.value = '正在连接服务器检查新版本...'
        checking.value = true
        showCheckButton.value = false
      })
      
      // 有可用更新
      window.electron.ipcRenderer.on('update-available', (_event, info: any) => {
        showNotification.value = true
        title.value = '发现新版本'
        message.value = `发现新版本 v${info?.version || ''}，是否立即更新？`
        updateAvailable.value = true
        checking.value = false
        showCheckButton.value = false
        showActions.value = true
      })
      
      // 没有可用更新
      window.electron.ipcRenderer.on('update-not-available', (_event) => {
        showNotification.value = true
        title.value = '已是最新版本'
        message.value = '您当前使用的已经是最新版本'
        checking.value = false
        showCheckButton.value = true
        setTimeout(() => {
          if (!updateAvailable.value && !updateDownloaded.value) {
            close()
          }
        }, 3000)
      })
      
      // 更新下载进度
      window.electron.ipcRenderer.on('download-progress', (_event, progressObj: any) => {
        showNotification.value = true
        downloadStarted.value = true
        showProgress.value = true
        title.value = '正在下载更新...'
        message.value = '更新正在下载中，请稍候...'
        downloadProgress.value = progressObj?.percent || 0
      })
      
      // 更新下载完成
      window.electron.ipcRenderer.on('update-downloaded', (_event, _info: any) => {
        showNotification.value = true
        title.value = '更新已就绪'
        message.value = '更新已下载完成，重启应用以应用更新'
        updateDownloaded.value = true
        downloadStarted.value = false
        showProgress.value = false
        showActions.value = true
      })
      
      // 更新错误
      window.electron.ipcRenderer.on('update-error', (_event, errorMsg: any) => {
        showNotification.value = true
        title.value = '更新失败'
        message.value = `更新过程中出现错误: ${errorMsg || '未知错误'}`
        error.value = true
        checking.value = false
        showCheckButton.value = true
        downloadStarted.value = false
        showProgress.value = false
      })
    })
    
    return {
      showNotification,
      title,
      message,
      updateAvailable,
      updateDownloaded,
      downloadStarted,
      downloadProgress,
      showProgress,
      showActions,
      checking,
      showCheckButton,
      getStatusIcon,
      checkForUpdates,
      downloadUpdate,
      installUpdate,
      close
    }
  }
})
</script>

<style scoped>
.update-notification-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.update-notification {
  display: flex;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 16px;
  width: 320px;
  max-width: 90vw;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.update-notification.with-progress {
  min-height: 140px;
}

.update-icon {
  margin-right: 12px;
  font-size: 24px;
  color: var(--el-color-primary);
  display: flex;
  align-items: flex-start;
}

.update-content {
  flex: 1;
}

.update-title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 6px;
  color: #303133;
}

.update-message {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
  line-height: 1.4;
}

.update-progress {
  margin: 12px 0;
}

.progress-text {
  font-size: 12px;
  color: #909399;
  text-align: right;
  margin-top: 4px;
}

.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.close-button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  font-size: 16px;
  transition: color 0.2s;
}

.close-button:hover {
  color: #606266;
}

/* 动画效果 */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s ease-in;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

@media (prefers-color-scheme: dark) {
  .update-notification {
    background-color: #1e1e1e;
  }
  
  .update-title {
    color: #e5eaf3;
  }
  
  .update-message {
    color: #a3a6ad;
  }
  
  .progress-text {
    color: #a3a6ad;
  }
  
  .close-button {
    color: #a3a6ad;
  }
  
  .close-button:hover {
    color: #e5eaf3;
  }
}
</style> 