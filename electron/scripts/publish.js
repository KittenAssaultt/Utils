#!/usr/bin/env node

/**
 * 用于构建和发布应用到GitHub的脚本
 * 使用方法: node scripts/publish.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 获取当前版本号
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

console.log(`当前版本: ${currentVersion}`);

// 询问新版本号
rl.question('请输入新版本号 (示例: 1.0.1): ', (newVersion) => {
  if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error('错误: 无效的版本号格式。请使用 x.y.z 格式 (例如 1.0.1)');
    rl.close();
    return;
  }

  // 询问版本更新说明
  rl.question('请输入版本更新说明: ', (releaseNotes) => {
    if (!releaseNotes.trim()) {
      console.error('错误: 更新说明不能为空');
      rl.close();
      return;
    }

    try {
      // 更新 package.json 中的版本号
      packageJson.version = newVersion;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`版本号已更新到 ${newVersion}`);

      // 创建临时文件存储更新说明
      const releaseNotesPath = path.join(__dirname, 'release-notes.md');
      fs.writeFileSync(releaseNotesPath, releaseNotes);
      console.log('更新说明已保存');

      // 构建应用
      console.log('正在构建应用...');
      
      // 根据操作系统选择构建命令
      const platform = process.platform;
      let buildCommand;

      if (platform === 'darwin') {
        buildCommand = 'npm run build:mac';
      } else if (platform === 'win32') {
        buildCommand = 'npm run build:win';
      } else if (platform === 'linux') {
        buildCommand = 'npm run build:linux';
      } else {
        console.error(`不支持的平台: ${platform}`);
        rl.close();
        return;
      }

      console.log(`执行构建命令: ${buildCommand}`);
      execSync(buildCommand, { stdio: 'inherit' });

      // 提交更改并推送到GitHub
      console.log('提交版本更改到Git...');
      
      // 检查Git仓库状态
      try {
        // 检查是否已初始化Git仓库
        try {
          execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
        } catch (e) {
          console.log('初始化Git仓库...');
          execSync('git init', { stdio: 'inherit' });
          execSync('git remote add origin https://github.com/KittenAssaultt/Utils.git', { stdio: 'inherit' });
        }
        
        // 添加并提交package.json
        execSync('git add package.json', { stdio: 'inherit' });
        execSync(`git commit -m "Bump version to ${newVersion}"`, { stdio: 'inherit' });
        
        // 检查是否存在main分支
        let currentBranch;
        try {
          currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
          console.log(`当前分支: ${currentBranch}`);
        } catch (e) {
          console.log('创建初始提交...');
          execSync('git add README.md', { stdio: 'inherit' });
          execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
          currentBranch = 'master';
        }
        
        // 如果不是main分支，创建并切换到main分支
        if (currentBranch !== 'main') {
          try {
            console.log('创建并切换到main分支...');
            execSync('git branch -M main', { stdio: 'inherit' });
          } catch (e) {
            console.error('切换到main分支失败:', e.message);
          }
        }
        
        // 推送到GitHub
        console.log('推送到GitHub...');
        execSync('git push -u origin main', { stdio: 'inherit' });
      } catch (error) {
        console.error(`Git操作失败: ${error.message}`);
        console.log('继续执行发布流程...');
      }

      // 创建GitHub Release
      console.log('创建GitHub Release...');
      try {
        execSync(`gh release create v${newVersion} --notes-file "${releaseNotesPath}" --title "v${newVersion}" ./dist/*.*`, { stdio: 'inherit' });
      } catch (error) {
        console.error(`创建Release失败: ${error.message}`);
        console.log('尝试使用alternative方法...');
        execSync(`gh release create v${newVersion} --notes-file "${releaseNotesPath}" --title "v${newVersion}"`, { stdio: 'inherit' });
        
        // 手动上传构建文件
        console.log('手动上传构建文件...');
        try {
          const distFiles = fs.readdirSync('./dist').filter(file => !fs.statSync(`./dist/${file}`).isDirectory());
          for (const file of distFiles) {
            console.log(`上传文件: ${file}`);
            execSync(`gh release upload v${newVersion} "./dist/${file}"`, { stdio: 'inherit' });
          }
        } catch (uploadError) {
          console.error(`上传文件失败: ${uploadError.message}`);
        }
      }
      
      // 清理临时文件
      fs.unlinkSync(releaseNotesPath);

      console.log(`🎉 成功发布版本 ${newVersion} 到GitHub！`);
    } catch (error) {
      console.error(`发布过程中出错: ${error.message}`);
      // 回滚版本号
      packageJson.version = currentVersion;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`已回滚版本号到 ${currentVersion}`);
    }

    rl.close();
  });
});

rl.on('close', () => {
  process.exit(0);
}); 