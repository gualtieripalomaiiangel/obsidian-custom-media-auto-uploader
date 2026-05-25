import { requestUrl, TFile, Vault, Notice, Menu, MenuItem, setIcon, CachedMetadata } from "obsidian";
import { fileTypeFromBuffer, FileTypeResult } from "file-type";

import CustomImageAutoUploader from "../main";
import { UploadSet } from "../setting";
import { Metadata } from "./interface";
import { $ } from "../lang/lang";


export const IMAGE_MIME_TYPES: Record<string, string[]> = {
  "image/bmp": ["bmp"],
  "image/avif": ["avif"],
  "image/gif": ["gif"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
}
export const IMAGE_EXTENSIONS = Object.values(IMAGE_MIME_TYPES).flat()

export const VIDEO_MIME_TYPES: Record<string, string[]> = {
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
}
export const VIDEO_EXTENSIONS = Object.values(VIDEO_MIME_TYPES).flat()

export interface ImageDownResult {
  err: boolean
  msg: string
  path?: string
  type?: FileTypeResult
}

export interface ImageUploadResult {
  err: boolean
  msg: string
  imageUrl?: string
  apiError?: string
  isVideo?: boolean
  posterUrl?: string
  videoType?: string
  isVideoSizeLimit?: boolean
}

/**
 * 从URL中提取文件名
 * @param url - 文件的URL
 * @param hasExt - 是否包含扩展名
 * @returns 提取的文件名
 */
export function getUrlFileName(url: string, hasExt: Boolean = true): string {
  let pathname = new URL(url).pathname
  let fileName = pathname.substring(pathname.lastIndexOf("/") + 1)
  fileName = fileName.substring(0, fileName.lastIndexOf("."))
  return decodeURI(fileName).replaceAll(/[\\\\/:*?\"<>|]/g, "-")
}

/**
 * 从给定的路径中提取目录名
 * @param path - 包含文件名的路径
 * @returns 路径中的目录名部分
 */
export function getDirname(path: string): string {
  let folderList = path.split("/")
  folderList.pop()
  return folderList.join("/")
}

/**
 * 生成指定长度的随机字符串
 * @param length - 随机字符串的长度
 * @returns 生成的随机字符串
 */
export function generateRandomString(length: number): string {
  // 定义包含所有可能字符的字符串
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  // 循环生成随机字符串
  for (let i = 0; i < length; i++) {
    // 生成一个随机索引
    const randomIndex = Math.floor(Math.random() * characters.length)
    // 将随机索引对应的字符添加到结果字符串中
    result += characters[randomIndex]
  }
  // 返回生成的随机字符串
  return result
}

/**
 * 生成文件的随机保存键
 * @returns 生成的随机保存键
 */
const nameSet = new Set()
export function getFileRandomSaveKey(): string {
  let name = (Math.random() + 1).toString(36).substr(2, 5)
  if (nameSet.has(name)) {
    name = `${name}-${(Math.random() + 1).toString(36).substr(2, 5)}`
  }
  nameSet.add(name)
  return name
}

/**
 * 检查并创建文件夹
 * @param path - 文件夹路径
 * @param vault - Vault实例
 */
export async function checkCreateFolder(path: string, vault: Vault) {
  if (path != "" && !vault.getFolderByPath(path)) {
    vault.createFolder(path)
  }
}

/**
 * 获取附件保存路径
 * @param file - 文件名
 * @param plugin - 插件实例
 * @returns 附件保存路径
 */
export async function getAttachmentSavePath(file: string, plugin: CustomImageAutoUploader): Promise<string> {
  return await plugin.app.fileManager.getAvailablePathForAttachment(file)
}

/**
 * 获取附件上传路径
 * @param image - 图片名
 * @param plugin - 插件实例
 * @returns 附件上传路径
 */
export async function getAttachmentUploadPath(image: string, plugin: CustomImageAutoUploader): Promise<TFile | null> {
  return plugin.app.metadataCache.getFirstLinkpathDest(image, image)
}

/**
 * 生成视频海报预览图
 * @param file - 视频文件
 * @param mode - 提取模式 ("first" 或 "random")
 * @returns 预览图 Blob
 */
export async function generateVideoPoster(file: Blob, mode: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Cannot get canvas context"));
      return;
    }

    const url = URL.createObjectURL(file);

    video.addEventListener("loadedmetadata", () => {
      // 设置提取的时间点
      if (mode === "random" && video.duration > 0) {
        // 避开最后0.5秒以免全是黑屏或结束画面
        const maxTime = Math.max(0, video.duration - 0.5);
        video.currentTime = Math.random() * maxTime;
      } else {
        video.currentTime = 0; // 第一帧
      }
    });

    video.addEventListener("seeked", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to generate blob from canvas"));
        }
      }, "image/png"); // 默认生成 PNG
    });

    video.addEventListener("error", (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    });

    // 开始加载
    video.src = url;
    video.load();
  });
}

/**
 * 替换文本中的内容 (WikiLink format for Uploads)
 * @param content - 原始内容
 * @param search - 要替换的内容
 * @param desc - 描述 (alt text)
 * @param path - 路径 (URL or file path)
 * @returns 替换后的内容: ![desc](path)
 */
export function replaceInTextForUpload(content: string, search: string, desc: string, path: string): string {
  const newLink = `![${desc}](${path})`
  return content.split(search).join(newLink)
}

/**
 * 替换文本中的内容 (Video Uploads)
 * @param content - 原始内容
 * @param search - 要替换的内容
 * @param videoUrl - 视频 URL
 * @param posterUrl - 海报 URL
 * @param videoType - 视频的 MIME 类型
 * @returns 替换后的 HTML video 标签
 */
export function replaceInTextForVideoUpload(content: string, search: string, videoUrl: string, posterUrl: string, videoType: string): string {
  const newLink = `<video controls poster="${posterUrl}">\n  <source src="${videoUrl}" type="${videoType}">\n</video>`;
  return content.split(search).join(newLink);
}

/**
 * 替换文本中的内容 (WikiLink format for Downloads)
 * @param content - 原始内容
 * @param search - 要替换的内容
 * @param desc - 描述 (alt text)
 * @param path - 路径 (local path)
 * @returns 替换后的内容: ![[path|desc]]
 */
export function replaceInTextForDownload(content: string, search: string, desc: string, path: string): string {
  const newLink = desc ? `![[${path}|${desc}]]` : `![[${path}]]`
  return content.split(search).join(newLink)
}

/**
 * 替换文本中的内容 (Deprecated)
 * @deprecated Use replaceInTextForUpload or replaceInTextForDownload instead
 */
export function replaceInText(content: string, search: string, desc: string, path: string, url?: string): string {
  if (url) {
    return replaceInTextForUpload(content, search, desc, path)
  } else {
    return replaceInTextForDownload(content, search, desc, path)
  }
}

/**
 * 检查是否包含排除的域名
 * @param src - 源URL
 * @param excludeDomains - 排除的域名列表
 * @returns 是否包含排除的域名
 */
export function hasExcludeDomain(src: string, excludeDomains: string): boolean {
  if (excludeDomains.trim() === "" || !/^http/.test(src)) {
    return false
  }

  let url = new URL(src)
  let has = false

  const domain = url.hostname

  const excludeDomainList = excludeDomains.split("\n").filter((item) => item !== "")

  excludeDomainList.forEach(function (item) {
    item = item.replace(/\./g, "\\.") //将.替换为\.，因为.在正则表达式中有特殊含义
    item = item.replace("*", ".*")

    let patt = new RegExp("^" + item, "i") //正则表达式
    let res = patt.exec(domain) //执行匹配，并获取到匹配结果

    if (res != null) {
      has = true
      return
    }
  })
  return has
}

/**
 * 自动添加排除的域名
 * @param src - 源URL
 * @param plugin - 插件实例
 */
export function autoAddExcludeDomain(src: string, plugin: CustomImageAutoUploader): void {
  let url = new URL(src)
  const domain = url.hostname
  let has = hasExcludeDomain(src, plugin.settings.excludeDomains)

  if (!has) {
    plugin.settings.excludeDomains += `\n${domain}`
    plugin.settings.excludeDomains = plugin.settings.excludeDomains.trim()
  }
  plugin.saveSettings(false)
}

/**
 * 下载图片
 * @param url - 图片URL
 * @param plugin - 插件实例
 * @returns 下载结果
 */
export async function imageDown(url: string, plugin: CustomImageAutoUploader): Promise<ImageDownResult> {
  const response = await requestUrl({ url })

  if (response.status !== 200) {
    return { err: false, msg: $("网络错误,请检查网络是否通畅") }
  }

  let type = <FileTypeResult>await fileTypeFromBuffer(response.arrayBuffer)

  if (!IMAGE_EXTENSIONS.includes(type.ext) && type) {
    return { err: true, msg: $("下载文件不是允许的图片类型") }
  }

  let urlObj = new URL(url)

  try {
    const name = getUrlFileName(url, false) != "" ? getUrlFileName(url, false) : getFileRandomSaveKey()
    const path = `${name}.${type.ext}`
    const userPath = await getAttachmentSavePath(path, plugin)
    checkCreateFolder(getDirname(userPath), this.app.vault)

    await plugin.app.vault.createBinary(userPath, response.arrayBuffer)

    return { err: false, msg: "", path: path, type }
  } catch (err) {
    return { err: true, msg: $("图片文件创建失败:") + err.message }
  }
}

/**
 * 上传视频和海报
 * @param videoBlob - 视频数据
 * @param posterBlob - 海报数据
 * @param file - 原文件
 * @param postData - 上传数据
 * @param plugin - 插件实例
 * @returns 视频和海报上传结果
 */
async function uploadVideoAndPoster(videoBlob: Blob, posterBlob: Blob, file: TFile, postData: UploadSet, plugin: CustomImageAutoUploader): Promise<ImageUploadResult> {
  // 1. Upload Video
  let requestDataVideo = new FormData();
  requestDataVideo.append("imagefile", new File([videoBlob], file.name, { type: videoBlob.type }), file.name);
  Object.keys(postData).forEach((v) => requestDataVideo.append(v, postData[v]));

  let responseVideo;
  try {
    responseVideo = await fetch(plugin.settings.api, {
      method: "POST",
      headers: plugin.settings.apiToken == "" ? new Headers() : new Headers({ Authorization: plugin.settings.apiToken }),
      body: requestDataVideo
    });
  } catch (error) {
    return { err: true, msg: $("视频网络错误,请检查网络是否通畅") };
  }

  if (responseVideo && !responseVideo.ok) {
    return { err: true, msg: $("视频网络错误,请检查网络是否通畅") };
  }

  let resultVideo = await responseVideo.json();
  if (resultVideo && !resultVideo.status) {
    const detailsMsg = resultVideo.details && Array.isArray(resultVideo.details) ? resultVideo.details.join("") : "";
    return { err: true, msg: "API Error:" + resultVideo.message + detailsMsg, apiError: detailsMsg };
  }

  // 2. Upload Poster
  // 按照要求，海报走正常的压缩逻辑（如果开启压缩） - 但这里我们直接在主逻辑处理比较好
  // 因此这里的 posterBlob 已经是处理好（压缩或未压缩）的二进制了
  let requestDataPoster = new FormData();
  requestDataPoster.append("imagefile", new File([posterBlob], file.name + "_poster.png", { type: posterBlob.type || "image/png" }), file.name + "_poster.png");
  Object.keys(postData).forEach((v) => requestDataPoster.append(v, postData[v]));

  let responsePoster;
  try {
    responsePoster = await fetch(plugin.settings.api, {
      method: "POST",
      headers: plugin.settings.apiToken == "" ? new Headers() : new Headers({ Authorization: plugin.settings.apiToken }),
      body: requestDataPoster
    });
  } catch (error) {
    return { err: true, msg: $("海报网络错误,请检查网络是否通畅") };
  }

  if (responsePoster && !responsePoster.ok) {
    return { err: true, msg: $("海报网络错误,请检查网络是否通畅") };
  }

  let resultPoster = await responsePoster.json();
  if (resultPoster && !resultPoster.status) {
    const detailsMsg = resultPoster.details && Array.isArray(resultPoster.details) ? resultPoster.details.join("") : "";
    return { err: true, msg: "API Error:" + resultPoster.message + detailsMsg, apiError: detailsMsg };
  }

  if (plugin.settings.isDeleteSource && file instanceof TFile) {
    plugin.app.fileManager.trashFile(file);
  }

  return {
    err: false,
    msg: resultVideo.message,
    imageUrl: resultVideo.data.imageUrl,
    isVideo: true,
    posterUrl: resultPoster.data.imageUrl,
    videoType: `video/${file.extension}`
  };
}


/**
 * 上传图片
 * @param path - 图片路径
 * @param postdata - 上传数据
 * @param plugin - 插件实例
 * @returns 上传结果
 */
export async function imageUpload(file: TFile, postData: UploadSet | undefined, plugin: CustomImageAutoUploader): Promise<ImageUploadResult> {
  const isImage = IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
  const isVideo = VIDEO_EXTENSIONS.includes(file.extension.toLowerCase());

  if (!isImage && !isVideo) {
    return { err: true, msg: $("上传文件不是允许的类型(图片/视频)") }
  }

  let body = await plugin.app.vault.readBinary(file)

  if (!postData) return { err: true, msg: $("扩展参数为空") }

  // 处理视频
  if (isVideo) {
    // 检查大小 (MB 转 Bytes)
    const maxSize = (plugin.settings.maxVideoSize || 50) * 1024 * 1024;
    if (body.byteLength > maxSize) {
      return { err: true, msg: $("视频大小超限: ") + file.name };
    }

    const videoBlob = new Blob([body], { type: `video/${file.extension}` });
    let posterBlob;

    try {
      posterBlob = await generateVideoPoster(videoBlob, plugin.settings.videoPosterFrame || "first");
    } catch (e) {
      return { err: true, msg: $("生成视频海报失败: ") + file.name };
    }

    // 将 posterBlob 进行可能的压缩 (复用图像压缩逻辑)
    let posterBuffer = await posterBlob.arrayBuffer();
    if (plugin.settings.isCompress) {
      try {
        const img = new Image()
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        const url = URL.createObjectURL(posterBlob)

        await new Promise((resolve, reject) => {
          img.onload = () => {
            const maxWidth = plugin.settings.compressMaxWidth
            const maxHeight = plugin.settings.compressMaxHeight
            let width = img.width
            let height = img.height

            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width)
              width = maxWidth
            }
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height)
              height = maxHeight
            }

            canvas.width = width
            canvas.height = height
            ctx?.drawImage(img, 0, 0, width, height)

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  blob.arrayBuffer().then((buffer) => {
                    posterBuffer = buffer
                    resolve(null)
                  })
                } else {
                  reject(new Error("Failed to create blob"));
                }
              },
              "image/png",
              plugin.settings.compressQuality
            )
          }
          img.onerror = reject;
          img.src = url
        })
        URL.revokeObjectURL(url)
      } catch (error) {
        // 压缩失败则使用未压缩版本
        console.error("Poster compression failed", error);
      }
    }

    return await uploadVideoAndPoster(videoBlob, new Blob([posterBuffer], { type: "image/png" }), file, postData, plugin);
  }

  let compressedBody = body

  if (plugin.settings.isCompress) {
    try {
      const img = new Image()
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      // 创建临时URL以加载图片
      const blob = new Blob([body], { type: `image/${file.extension}` })
      const url = URL.createObjectURL(blob)

      await new Promise((resolve, reject) => {
        img.onload = () => {
          // 设置压缩后的尺寸,保持宽高比
          const maxWidth = plugin.settings.compressMaxWidth
          const maxHeight = plugin.settings.compressMaxHeight
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }

          canvas.width = width
          canvas.height = height

          // 绘制并压缩
          ctx?.drawImage(img, 0, 0, width, height)

          // 转换为二进制
          canvas.toBlob(
            (blob) => {
              if (blob) {
                blob.arrayBuffer().then((buffer) => {
                  compressedBody = buffer
                  resolve(null)
                })
              }
            },
            `image/${file.extension}`,
            plugin.settings.compressQuality
          )
        }
        img.src = url
      })

      URL.revokeObjectURL(url)
    } catch (error) {
      return { err: true, msg: $("图片压缩失败:") + error.message }
    }
  }

  let requestData = new FormData()
  requestData.append("imagefile", new File([compressedBody], file.name, { type: `image/${file.extension}` }), file.name)

  Object.keys(postData).forEach((v, i, p) => {
    requestData.append(v, postData[v])
  })

  let response
  try {
    response = await fetch(plugin.settings.api, { method: "POST", headers: plugin.settings.apiToken == "" ? new Headers() : new Headers({ Authorization: plugin.settings.apiToken }), body: requestData })
  } catch (error) {
    return { err: true, msg: $("网络错误,请检查网络是否通畅") }
  }

  if (response && !response.ok) {
    let result = await response.text()
    return { err: true, msg: $("网络错误,请检查网络是否通畅") }
  }

  let result = await response.json()

  if (result && !result.status) {
    const detailsMsg = result.details && Array.isArray(result.details) ? result.details.join("") : ""
    return { err: true, msg: "API Error:" + result.message + detailsMsg, apiError: detailsMsg }
  } else {
    if (plugin.settings.isDeleteSource && file instanceof TFile) {
      plugin.app.fileManager.trashFile(file)
    }

    return { err: false, msg: result.message, imageUrl: result.data.imageUrl }
  }
}

/**
 * 处理文件的元数据缓存
 * @param activeFile - 当前活动文件
 * @param plugin - 插件实例
 * @returns 处理后的元数据数组
 */
export function metadataCacheHandle(cache: CachedMetadata, plugin: CustomImageAutoUploader): Metadata[] {
  let metadataNeedKeys = Array<string>()

  plugin.settings.propertyNeedSets.forEach((item, i) => {
    metadataNeedKeys[i] = item.key
  })

  let handleMetadata: Metadata[] = []

  if (cache?.frontmatter) {
    Object.keys(cache.frontmatter).forEach((key) => {
      if (cache?.frontmatter && metadataNeedKeys.includes(key)) {
        let i: number = metadataNeedKeys.indexOf(key)
        if (typeof cache.frontmatter[key] == "string") {
          const match = cache.frontmatter[key].match(/^\!\[\[(.*)\]\]$/)
          if (match) {
            cache.frontmatter[key] = match[1]
          }
          handleMetadata.push({ key: key, type: "string", value: [<string>cache.frontmatter[key]], params: plugin.settings.propertyNeedSets[i] })
        } else if (Array.isArray(cache.frontmatter[key])) {
          let pics = []
          for (let index = 0; index < cache.frontmatter[key].length; index++) {
            pics.push(<string>cache.frontmatter[key][index])
          }
          handleMetadata.push({ key: key, type: "array", value: pics, params: plugin.settings.propertyNeedSets[i] })
        }
      }
    })
  }

  return handleMetadata
}

/**
 * 显示任务结果通知
 * @param plugin 插件实例
 * @param type 任务类型：'download' | 'upload' | 'all'
 * @param isMetadata 是否为元数据任务
 */
export function showTaskNotice(plugin: CustomImageAutoUploader, type: "download" | "upload" | "all"): void {
  if (plugin.settings.isCloseNotice) return
  let message = ""
  if (type === "all") {
    // 显示下载和上传的所有信息
    if (plugin.downloadStatus.total > 0) {
      message += `${$("下载")}:\n`
      message += `succeed: ${plugin.downloadStatus.current} \n`
      message += `failed: ${plugin.downloadStatus.total - plugin.downloadStatus.current}\n\n`
    }
    if (plugin.uploadStatus.total > 0) {
      message += `${$("上传")}:\n`
      message += `succeed: ${plugin.uploadStatus.current} \n`
      message += `failed: ${plugin.uploadStatus.total - plugin.uploadStatus.current}`
    }
  } else {
    // 显示单个任务的信息
    const status = type === "download" ? plugin.downloadStatus : plugin.uploadStatus
    const typeText = type === "download" ? $("下载") : $("上传")
    message = `${typeText}:\nsucceed: ${status.current} \nfailed: ${status.total - status.current}`
  }
  if (message != "" && !plugin.settings.isCloseNotice) {
    new Notice(message)
  }
}

/**
 * 显示错误通知
 * @param message 错误信息
 */
export function showErrorNotice(message: string): void {
  new Notice(message)
}

/**
 * 检查插件状态
 * @param plugin - 插件实例
 */
export function statusCheck(plugin: CustomImageAutoUploader): void {
  if (plugin.statusBar.length == 0) {
    plugin.statusBar[0] = plugin.addStatusBarItem()
    plugin.statusBar[1] = plugin.addStatusBarItem()
    plugin.statusBar[2] = plugin.addStatusBarItem()
  }
  setIcon(plugin.statusBar[0], "image")
  plugin.statusBar[0].setAttrs({ title: "Custom Image Auto Uploader / " + $("Custom Image Auto Uploader") })

  setIcon(plugin.statusBar[1], "none")
  if (plugin.settings.isAutoUpload && plugin.settings.isAutoDown) {
    setIcon(plugin.statusBar[1], "arrow-down-up")
    plugin.statusBar[1].setAttrs({ title: $("自动上传下载") + ":" + $("已开启") })
  } else {
    if (plugin.settings.isAutoUpload) {
      setIcon(plugin.statusBar[1], "circle-arrow-up")
      plugin.statusBar[1].setAttrs({ title: $("自动上传") + ":" + $("已开启") + " / " + $("自动下载") + ":" + $("已关闭") })
    }
    if (plugin.settings.isAutoDown) {
      setIcon(plugin.statusBar[1], "circle-arrow-down")
      plugin.statusBar[1].setAttrs({ title: $("自动下载") + ":" + $("已开启") + " / " + $("自动上传") + ":" + $("已关闭") })
    }
  }

  let title = ""

  // 根据全局状态类型显示进度
  if (plugin.statusType !== "none") {
    if (plugin.statusType === "download" && plugin.downloadStatus.total > 0) {
      title += $("下载") + `: ${plugin.downloadStatus.current}/${plugin.downloadStatus.total}`
    } else if (plugin.statusType === "upload" && plugin.uploadStatus.total > 0) {
      title += $("上传") + `: ${plugin.uploadStatus.current}/${plugin.uploadStatus.total}`
    } else if (plugin.statusType === "all") {
      if (plugin.downloadStatus.total > 0 || plugin.uploadStatus.total > 0) {
        if (plugin.downloadStatus.total > 0) {
          title += $("下载") + `: ${plugin.downloadStatus.current}/${plugin.downloadStatus.total}`
        }
        if (plugin.uploadStatus.total > 0) {
          if (plugin.downloadStatus.total > 0) title += " "
          title += $("上传") + `: ${plugin.uploadStatus.current}/${plugin.uploadStatus.total}`
        }
      }
    }
  }

  plugin.statusBar[2].setText(title)
}

export function setMenu(menu: Menu, plugin: CustomImageAutoUploader, isShowAuto: boolean = false, isNoteMenu: boolean = false) {
  if ((menu as any)._hasImageUploaderMenu) return
  (menu as any)._hasImageUploaderMenu = true

  if (isShowAuto) {

    //ddddd

    menu.addSeparator()
    menu.addItem((item: MenuItem) => {
      item
        .setIcon("arrow-down-up")
        .setTitle($("一键上下传照片"))
        .onClick(async () => {
          plugin.resetStatus("all", true)
          await plugin.ContentImageAutoHandle(true)
          await plugin.MetadataImageAutoHandle(true)
          showTaskNotice(plugin, "all")
          statusCheck(plugin)
        })
    })
  }
  menu.addItem((item: MenuItem) => {
    item
      .setIcon("download")
      .setTitle($("下载当前笔记图片"))
      .onClick(async () => {
        plugin.resetStatus("download", true)
        await plugin.ContentDownImage()
        await plugin.MetadataDownImage()
        showTaskNotice(plugin, "download")
        statusCheck(plugin)
      })
  })
  menu.addItem((item: MenuItem) => {
    item
      .setIcon("upload")
      .setTitle($("上传当前笔记图片"))
      .onClick(async () => {
        plugin.resetStatus("upload", true)
        await plugin.ContentUploadImage()
        await plugin.MetadataUploadImage()
        showTaskNotice(plugin, "upload")
        statusCheck(plugin)
      })
  })

  if (!isNoteMenu) {

    menu.addSeparator()

    menu.addItem((item: MenuItem) => {
      item
        .setIcon("download-cloud")
        .setTitle($("下载全库图片"))
        .onClick(async () => {
          plugin.resetStatus("download", true)
          await plugin.VaultDownImage()
          showTaskNotice(plugin, "download")
          statusCheck(plugin)
        })
    })
    menu.addItem((item: MenuItem) => {
      item
        .setIcon("upload-cloud")
        .setTitle($("上传全库图片"))
        .onClick(async () => {
          plugin.resetStatus("upload", true)
          await plugin.VaultUploadImage()
          showTaskNotice(plugin, "upload")
          statusCheck(plugin)
        })
    })

    menu.addItem((item: MenuItem) => {
      item
        .setIcon("trash")
        .setTitle($("删除未引用图片（全库）"))
        .onClick(async () => {
          await plugin.VaultDeleteUnreferencedImages()
        })
    })
  }
}
